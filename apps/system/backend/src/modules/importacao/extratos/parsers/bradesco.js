import XLSX from 'xlsx';
import { assert } from '../../../../shared/errors.js';
import { clean, normalize, dateBR, moneyBR, movementAmount, validateStatement } from './common.js';
export function parseBradescoRows(rows) {
  const identity=rows.flat().map(clean).find(value=>/^Extrato de:\s*Agência:/i.test(value));
  const match=identity?.match(/Agência:\s*(\d+)\s+Conta:\s*(\d+-\d+)/i);
  assert(match,'Agência e conta não identificadas no extrato Bradesco.');
  const statement={bank:'bradesco',agency:match[1],account:match[2],entries:[],snapshots:[],opening:null};
  let block=false,needOpening=false,running=null,creditSum=0,debitSum=0;
  for(const row of rows){
    const cells=row.map(clean);
    if(cells.slice(0,6).map(normalize).join(';')==='DATA;LANCAMENTO;DCTO.;CREDITO (R$);DEBITO (R$);SALDO (R$)'){
      assert(!block,'Bloco de lançamentos sem fechamento.');block=true;needOpening=true;creditSum=0;debitSum=0;continue;
    }
    if(!block)continue;
    if(!cells.some(Boolean))continue;
    const [date,history,document,credit,debit,balance]=cells;
    if(normalize(history)==='SALDO ANTERIOR'){
      assert(needOpening&&!credit&&!debit,'Saldo anterior em posição inválida.');
      const at=dateBR(date),value=moneyBR(balance);
      if(!statement.opening)statement.opening={at,value};
      else assert(value===running,'O saldo de abertura do próximo bloco diverge do fechamento anterior.');
      running=value;needOpening=false;continue;
    }
    assert(!needOpening,'Falta saldo anterior no bloco Bradesco.');
    if(normalize(date)==='TOTAL'){
      assert(moneyBR(balance)===running&&moneyBR(credit)===creditSum&&moneyBR(debit)===debitSum,'Totais do bloco Bradesco inconsistentes.');
      block=false;continue;
    }
    const at=dateBR(date),value=movementAmount(credit,debit),current=moneyBR(balance);
    assert(history&&!/^SALDO\b/.test(normalize(history)),'Linha de saldo não pode ser movimentação.');
    assert(running+value===current,`Saldo Bradesco inconsistente em ${at}.`);running=current;
    if(value>0)creditSum+=value;else debitSum+=value;
    statement.entries.push({at,date:at,history,document,value});statement.snapshots.push({at,value:current,index:statement.entries.length-1});
  }
  assert(!block,'Extrato Bradesco incompleto: bloco sem total.');
  return validateStatement(statement);
}
export function parseBradesco(buffer,filename) {
  assert(/\.xls$/i.test(filename)&&buffer.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex')),'Envie o arquivo XLS original do Bradesco.');
  let workbook;
  try{workbook=XLSX.read(buffer,{type:'buffer',cellFormula:false,sheetRows:20002});}catch{assert(false,'Não foi possível ler o arquivo XLS do Bradesco.');}
  assert(workbook.SheetNames.length===1,'Esperada uma única planilha no extrato Bradesco.');
  const sheet=workbook.Sheets[workbook.SheetNames[0]];
  assert(!sheet['!fullref'],'Extrato excede o limite de 20.000 linhas.');
  return parseBradescoRows(XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false}));
}
