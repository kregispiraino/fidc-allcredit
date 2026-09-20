import * as XLSX from 'xlsx';
import { createHash } from 'node:crypto';
import { assert, positiveId } from '../../../shared/errors.js';
import { parseExactAmount } from '../../../shared/money.js';
import { listExtrato, validateExtratoRow, saveExtratoRows } from './service.js';
const fields=['id','status','data','entidade_id','natureza_id','historico','valor','conta_id','valor_subcentavos'];
const revision=row=>createHash('sha256').update(JSON.stringify(fields.map(key=>row[key]??null))).digest('hex');
const labels={pending:'Pendente',reconciled:'Conciliado',reversal:'Estorno'};
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const headers=['ID','Status','Data','Entidade','Natureza','Histórico','Valor (R$)','Conta','Revisão'];
export function exportExtrato(db,ids){
  assert(Array.isArray(ids)&&ids.length>0&&ids.length<=10000,'Selecione de 1 a 10.000 registros para exportar.');
  const wanted=new Set(ids.map(positiveId)),rows=listExtrato(db).filter(row=>wanted.has(row.id));
  assert(rows.length===wanted.size,'Alguns registros não estão mais disponíveis. Atualize a tabela.',409);
  const sheet=XLSX.utils.aoa_to_sheet([headers,...rows.map(row=>[row.id,labels[row.status],row.data,row.entidade||'',row.natureza||'',row.historico,Number(row.valor_reais),row.conta,revision(row)])]);
  sheet['!cols']=[{wch:10},{wch:15},{wch:13},{wch:28},{wch:28},{wch:60},{wch:19},{wch:26},{hidden:true}];
  sheet['!autofilter']={ref:`A1:H${rows.length+1}`};
  for(let r=2;r<=rows.length+1;r++)sheet[`G${r}`].z='#,##0.00##;[Red]-#,##0.00##';
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Extrato');
  return XLSX.write(book,{type:'buffer',bookType:'xlsx'});
}
function readFile(payload){
  assert(typeof payload.filename==='string'&&/\.(xlsx?|csv)$/i.test(payload.filename),'Selecione o Excel (.xlsx/.xls) ou CSV exportado do Extrato.');
  const {content}=payload;assert(typeof content==='string'&&content.length<=11200000&&/^[A-Za-z0-9+/]+={0,2}$/.test(content),'Arquivo inválido ou maior que 8 MB.');
  const buffer=Buffer.from(content,'base64');assert(buffer.length<=8*1024*1024&&buffer.toString('base64')===content,'Arquivo inválido ou maior que 8 MB.');
  let book;try{book=XLSX.read(buffer,{type:'buffer',raw:true,cellDates:false});}catch{assert(false,'Não foi possível ler a planilha.');}
  const name=book.SheetNames.includes('Extrato')?'Extrato':book.SheetNames.length===1?book.SheetNames[0]:null;
  assert(name,'Selecione uma planilha com a aba Extrato.');
  const sheet=book.Sheets[name];assert(sheet?.['!ref'],'Planilha vazia.');
  const range=XLSX.utils.decode_range(sheet['!ref']);assert(range.e.r-range.s.r<=10000&&range.e.c<60,'Importe até 10.000 linhas e 60 colunas.');
  const rawHeaders=[];for(let c=range.s.c;c<=range.e.c;c++)rawHeaders[c]=normalize(sheet[XLSX.utils.encode_cell({r:range.s.r,c})]?.v);
  const legacy=rawHeaders.includes('conta_id');
  const names=legacy?['id','status','data','entidade_id','natureza_id','historico','valor','conta_id']:headers.slice(0,8).map(normalize);
  const indexes=names.map(name=>{const hits=rawHeaders.flatMap((value,c)=>value===name?[c]:[]);assert(hits.length===1,`Coluna ausente ou repetida: ${name}.`);return hits[0];});
  const rev=rawHeaders.indexOf('revisao'),rows=[];
  for(let r=range.s.r+1;r<=range.e.r;r++){
    const cells=indexes.map(c=>sheet[XLSX.utils.encode_cell({r,c})]);
    if(cells.every(cell=>cell?.v==null||String(cell.v).trim()===''))continue;
    assert(cells.every(cell=>!cell||(!cell.f&&!['e','b'].includes(cell.t))),`Linha ${r+1}: converta fórmulas em valores e corrija células com erro.`);
    rows.push({line:r+1,values:cells.map(cell=>cell?.v??''),revision:rev<0?'':String(sheet[XLSX.utils.encode_cell({r,c:rev})]?.v??'')});
  }
  assert(rows.length,'A planilha não contém registros.');return {rows,legacy,date1904:!!book.Workbook?.WBProps?.date1904};
}
function dateValue(value,date1904){
  if(typeof value==='number'){
    const parsed=XLSX.SSF.parse_date_code(value,{date1904});assert(parsed,'Data inválida.');
    return `${String(parsed.y).padStart(4,'0')}-${String(parsed.m).padStart(2,'0')}-${String(parsed.d).padStart(2,'0')}`;
  }
  const text=String(value).trim(),parts=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  return parts?`${parts[3]}-${parts[2]}-${parts[1]}`:text;
}
function amount(value){
  if(typeof value==='number'){parseExactAmount(String(value));return String(value);}
  let text=String(value).trim().replace(/^(?:R\$\s*([+-]?)|([+-]?)\s*R\$)\s*/i,'$1$2').replace(/\s/g,'');
  if(text.includes(','))text=text.replaceAll('.','').replace(',','.');
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(text))text=text.replaceAll('.','');
  parseExactAmount(text);return text;
}
function prepare(db,payload){
  const file=readFile(payload),seen=new Set(),changes=[],revisions=[];let unchanged=0;
  const catalogs=Object.fromEntries(['entidades','naturezas','contas'].map(key=>[key,db.prepare(`SELECT id,nome FROM gerenciador_${key}`).all()]));
  const related=(value,key)=>{
    if(value===''&&key!=='contas')return null;
    if(file.legacy)return value===''?null:positiveId(value);
    const matches=catalogs[key].filter(row=>normalize(row.nome)===normalize(value));assert(matches.length===1,`Cadastro não encontrado ou ambíguo em ${key}: ${value}.`);return matches[0].id;
  };
  for(const source of file.rows){
    try{
      const [rawId,status,data,entidade,natureza,historico,valor,conta]=source.values;
      const id=positiveId(rawId);assert(!seen.has(id),'ID repetido na planilha.');seen.add(id);
      const current=db.prepare('SELECT * FROM workflow_extrato WHERE id=?').get(id);assert(current,`O ID ${id} não existe. A importação só atualiza registros existentes.`,409);
      const before=revision(current);assert(!source.revision||source.revision===before,`O registro ${id} mudou desde a exportação. Exporte novamente antes de editar.`,409);
      const mappedStatus=Object.keys(labels).find(key=>normalize(status)===normalize(labels[key])||status===key);
      const item={id,status:mappedStatus,data:dateValue(data,file.date1904),entidade_id:related(entidade,'entidades'),natureza_id:related(natureza,'naturezas'),historico:String(historico),valor_reais:amount(valor),conta_id:related(conta,'contas')};
      const after=validateExtratoRow(db,item);revisions.push({id,revision:before});
      if(revision(after)===before)unchanged++;else changes.push(item);
    }catch(error){error.message=`Linha ${source.line}: ${error.message}`;throw error;}
  }
  return {changes,revisions,unchanged,total:file.rows.length};
}
export function previewExtratoImport(db,payload){
  const {changes,revisions,unchanged,total}=prepare(db,payload);
  return {total,atualizar:changes.length,sem_alteracao:unchanged,revisoes:revisions};
}
export function importExtratoSpreadsheet(db,payload){
  const check=()=>{
    assert(Array.isArray(payload.revisoes)&&payload.revisoes.length>0&&payload.revisoes.length<=10000,'Confira a planilha antes de importar.');
    const current=new Map(payload.revisoes.map(row=>[positiveId(row.id),row.revision]));
    assert(current.size===prepared.total,'Confira novamente a planilha antes de importar.',409);
    for(const row of prepared.revisions)assert(current.get(row.id)===row.revision&&revision(db.prepare('SELECT * FROM workflow_extrato WHERE id=?').get(row.id)||{})===row.revision,`O registro ${row.id} mudou após a conferência. Confira novamente a planilha.`,409);
  };
  const prepared=prepare(db,payload);check();
  if(prepared.changes.length)saveExtratoRows(db,prepared.changes,{limit:10000,beforeWrite:check});
  return {atualizados:prepared.changes.length,sem_alteracao:prepared.unchanged,total:prepared.total};
}
