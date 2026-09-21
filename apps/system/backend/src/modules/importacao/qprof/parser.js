import { csvRows } from './csv.js';
import * as XLSX from 'xlsx';
import { assert } from '../../../shared/errors.js';

const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const columns={cedente:['cedente'],sacado:['sacado'],numero:['snum','titulo','numerodotitulo','numero'],valor:['vlrpago','valor'],data_liquidacao:['dtaliq','datadeliquidacao'],carteira:['carteira'],carteira_interna:['cartinterna','carteirainterna']};
export function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
function dateValue(value,date1904){
  if(typeof value==='number'){
    assert(value>=0&&!(Math.floor(value)===60&&!date1904),'Data de liquidação inválida.');
    const date=XLSX.SSF.parse_date_code(value,{date1904});
    value=date?`${String(date.y).padStart(4,'0')}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`:'';
  }else{
    value=String(value??'').trim();
    const br=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if(br)value=`${br[3]}-${br[2]}-${br[1]}`;
  }
  assert(validDate(value),'Data de liquidação inválida.');return value;
}
function moneyValue(value){
  if(typeof value==='string'){
    value=value.replace(/R\$|\s/g,'');
    if(value.includes(','))value=value.replaceAll('.','').replace(',','.');
    assert(/^\d+(\.\d{1,2})?$/.test(value),'Valor pago inválido.');value=Number(value);
  }
  const cents=Math.round(value*100);
  assert(typeof value==='number'&&Number.isSafeInteger(cents)&&cents>0&&cents<=9000000000000&&Math.abs(value*100-cents)<0.01,'Valor pago deve ser positivo e ter até duas casas decimais.');
  return cents;
}
export function parseQprof(buffer,{filename=''}={}){
  let matrix,date1904=false;
  if(/\.csv$/i.test(filename))matrix=csvRows(buffer).map(row=>row.map(v=>({v,t:'s'})));
  else{
    let book;
    try{book=XLSX.read(Buffer.from(buffer),{type:'buffer',cellDates:false});}catch{assert(false,'Não foi possível ler a planilha Qprof.');}
    assert(book.SheetNames.length===1,'Envie a planilha de títulos com uma única aba.');
    const sheet=book.Sheets[book.SheetNames[0]];
    assert(sheet?.['!ref'],'A planilha está vazia.');
    const range=XLSX.utils.decode_range(sheet['!ref']);
    assert(range.e.r-range.s.r<=100000&&range.e.c<200,'A planilha deve conter até 100.000 títulos e 200 colunas.');
    matrix=[];
    for(let r=range.s.r;r<=range.e.r;r++){
      const row=[];for(let c=range.s.c;c<=range.e.c;c++)row.push(sheet[XLSX.utils.encode_cell({r,c})]);matrix.push(row);
    }
    date1904=!!book.Workbook?.WBProps?.date1904;
  }
  const headers=matrix[0].map(cell=>normalize(cell?.v));
  const mapped={};
  for(const [key,names] of Object.entries(columns)){
    const matches=headers.flatMap((name,index)=>names.includes(name)?[index]:[]);
    assert(matches.length===1,`Coluna obrigatória ausente ou repetida: ${key}.`);mapped[key]=matches[0];
  }
  const situationColumn=headers.findIndex(name=>['situacao','situacaodotitulo'].includes(name));
  const statusColumn=situationColumn>=0?situationColumn:headers.indexOf('status');
  const rows=[];
  for(let r=1;r<matrix.length;r++){
    const cells=Object.fromEntries(Object.entries(mapped).map(([key,c])=>[key,matrix[r][c]]));
    if(Object.values(cells).every(cell=>cell?.v==null||String(cell.v).trim()===''))continue;
    if(statusColumn>=0&&!['baixado','baixada','baixados','baixadas'].includes(normalize(matrix[r][statusColumn]?.v)))continue;
    try{
      const row={};
      assert(Object.values(cells).every(cell=>!cell||!['e','b'].includes(cell.t)),'Uma das colunas necessárias contém erro ou valor lógico.');
      assert(cells.numero?.t!=='n'||(Number.isFinite(cells.numero.v)&&Math.abs(cells.numero.v)<=Number.MAX_SAFE_INTEGER),'Número do título inválido ou com precisão numérica insuficiente.');
      for(const key of ['numero','cedente','sacado','carteira','carteira_interna']){
        const cell=cells[key];
        row[key]=String(key==='numero'&&cell?.t==='n'&&/^\d+$/.test(cell.w||'')?cell.w:cell?.v??'').trim();
        assert(row[key].length<=160,`O campo ${key} deve ter até 160 caracteres.`);
      }
      assert(row.numero,'Informe o número do título.');
      row.valor=moneyValue(cells.valor?.v);row.data_liquidacao=dateValue(cells.data_liquidacao?.v,date1904);
      rows.push(row);
    }catch(error){error.message=`Linha ${r+1}: ${error.message}`;throw error;}
  }
  assert(rows.length,'A planilha não contém títulos válidos. A base anterior foi preservada.');
  return rows;
}
