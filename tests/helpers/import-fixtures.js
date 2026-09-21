import * as XLSX from 'xlsx';
// Fictional data generated in memory: no customer statements or spreadsheets in Git.
export function qprofFile(){
  const headers=['Cedente','Sacado','S. Núm.','Vlr. Pago','Dta. Liq.','Carteira','Cart. Interna'];
  const rows=Array.from({length:40},(_,i)=>[i===39?'Outra Empresa Exemplo':'Empresa Exemplo',`Cliente Exemplo ${i+1}`,i===39?'FIC-0001':`FIC-${String(i+1).padStart(4,'0')}`,i===0?1234.56:100+i,'10/09/2026','CARTEIRA-DEMO','TÍTULOS FATURIZADOS']);
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,...rows]),'Titulos');return XLSX.write(book,{type:'buffer',bookType:'xlsx'});
}
export function multiSheetFile(){
  const book=XLSX.utils.book_new();for(const name of ['A','B'])XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Exemplo'],[1]]),name);
  return XLSX.write(book,{type:'buffer',bookType:'xlsx'});
}
export function singulareFile(account='89727720'){
  return {filename:`CONTACORRENTE_EXTRATO_${account}_20260918190000000.csv`,buffer:Buffer.from([
    'Data;Tipo do lançamento;Historico;Documento;Credito;Debito;Saldo',
    ';SALDO DISPONIVEL;SALDO DISPONIVEL;0;;;R$ 10,00',
    '17/09/2026 10:00:00;TED;RECEBIMENTO TESTE;1;R$ 20,00;;',
    ';SALDO DISPONIVEL;SALDO DISPONIVEL;0;;;R$ 30,00',
    '18/09/2026 16:17:39;TARIFA;MOVIMENTAÇÃO;2;;R$ 1,00;',
    ';SALDO DISPONIVEL;SALDO DISPONIVEL;0;;;R$ 29,00',
    'Data;SaldoDisponivel',
    '18/09/2026 00:00:00;29,00;;;;;;;;'
  ].join('\n'))};
}
export function bradescoFile(){
  const rows=[['Extrato de: Agência: 3  Conta: 57420-1'],['Data','Lançamento','Dcto.','Crédito (R$)','Débito (R$)','Saldo (R$)'],
    ['16/09/2026','SALDO ANTERIOR','','','','10,00'],['17/09/2026','RECEBIMENTO TESTE','1','20,00','','30,00'],['18/09/2026','TARIFA TESTE','2','','-1,00','29,00'],['Total','','','20,00','-1,00','29,00']];
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'Extrato');
  return {filename:'extrato-teste.xls',buffer:XLSX.write(book,{type:'buffer',bookType:'biff8'})};
}
