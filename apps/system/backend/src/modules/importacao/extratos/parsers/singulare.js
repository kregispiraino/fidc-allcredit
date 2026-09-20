import { assert } from '../../../../shared/errors.js';
import { clean, normalize, dateBR, moneyBR, movementAmount, validateStatement } from './common.js';
// Small RFC-style semicolon reader: quoted descriptions may contain separators or newlines.
export function csvRows(text) {
  const rows=[];let row=[],value='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else{assert(quoted||value==='', 'Aspas inválidas no CSV.');quoted=!quoted;}}
    else if(c===';'&&!quoted){row.push(value);value='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value='';}
    else value+=c;
  }
  assert(!quoted,'CSV contém campo com aspas não fechadas.');
  row.push(value);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
export function parseSingulare(buffer,filename) {
  const account=filename.match(/^CONTACORRENTE_EXTRATO_(\d+)_\d+(?:\(\d+\))?\.csv$/i)?.[1];
  assert(account,'Use o CSV original da Singulare, com o número da conta no nome.');
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{assert(false,'O CSV da Singulare deve estar em UTF-8.');}
  const rows=csvRows(text.replace(/^\uFEFF/,''));
  assert(rows[0]?.map(normalize).join(';')==='DATA;TIPO DO LANCAMENTO;HISTORICO;DOCUMENTO;CREDITO;DEBITO;SALDO','Cabeçalho do CSV Singulare não reconhecido.');
  const statement={bank:'singulare',account,entries:[],snapshots:[],opening:null};
  let summary=false;
  for(const [index,row] of rows.slice(1).entries()){
    if(normalize(row[0])==='DATA'&&normalize(row[1])==='SALDODISPONIVEL'){summary=true;continue;}
    if(summary){
      // The dated midnight financial summary is NEVER a transaction or its timestamp.
      assert(row.length===10,'Quadro final da Singulare inválido.');
      dateBR(row[0],{time:true});
      const last=statement.snapshots.at(-1);assert(last&&moneyBR(row[1])===last.value,'O quadro final diverge do último saldo disponível.');
      continue;
    }
    assert(row.length===7,`Linha ${index+2} do CSV inválida.`);
    if(normalize(row[1])==='SALDO DISPONIVEL'&&normalize(row[2])==='SALDO DISPONIVEL'){
      assert(!clean(row[4])&&!clean(row[5]),'Linha de saldo contém crédito ou débito inesperado.');
      const value=moneyBR(row[6]),last=statement.entries.at(-1);
      if(!last){assert(statement.opening===null,'Mais de um saldo inicial no extrato.');statement.opening={value};}
      else statement.snapshots.push({at:last.at,value,index:statement.entries.length-1});
      continue;
    }
    assert(statement.opening!==null,'Falta o saldo inicial da Singulare.');
    assert(!clean(row[6])&&clean(row[1])&&clean(row[2]),'Linha de movimentação Singulare inválida.');
    const at=dateBR(row[0],{time:true});
    statement.entries.push({at,date:at.slice(0,10),history:`${clean(row[1])} · ${clean(row[2])}`,document:clean(row[3]),value:movementAmount(row[4],row[5])});
  }
  return validateStatement(statement);
}
