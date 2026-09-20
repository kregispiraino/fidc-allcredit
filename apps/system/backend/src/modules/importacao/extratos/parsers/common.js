import { assert } from '../../../../shared/errors.js';
export const clean=value=>String(value??'').trim();
export const normalize=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toUpperCase();
export function dateBR(value,{time=false}={}) {
  const match=clean(value).match(time?/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/:/^(\d{2})\/(\d{2})\/(\d{4})$/);
  assert(match,`Data inválida no extrato: ${value}.`);
  const [,d,m,y,h='00',min='00',sec='00']=match,date=`${y}-${m}-${d}`;
  const parsed=new Date(`${date}T00:00:00Z`);
  assert(Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date&&+h<24&&+min<60&&+sec<60,'Data ou horário inválido no extrato.');
  return time?`${date} ${h}:${min}:${sec}`:date;
}
export function moneyBR(value) {
  const text=clean(value).replace(/^R\$\s*/,'').replace(/\s/g,'');
  assert(/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(text),`Valor monetário inválido no extrato: ${value}.`);
  const [whole,fraction]=text.replaceAll('.','').replace('-','').split(',');
  const cents=(Number(whole)*100+Number(fraction))*(text.startsWith('-')?-1:1);
  assert(Number.isSafeInteger(cents)&&Math.abs(cents)<=9000000000000,'Valor do extrato fora do limite.');return cents;
}
export function movementAmount(credit,debit) {
  const hasCredit=clean(credit)!=='',hasDebit=clean(debit)!=='';
  assert(hasCredit!==hasDebit,'Movimentação precisa ter somente crédito ou débito.');
  const amount=moneyBR(hasCredit?credit:debit);
  assert(amount!==0&&(!hasCredit||amount>0),'Crédito inválido ou movimentação com valor zero.');
  return hasCredit?amount:-Math.abs(amount);
}
export function validateStatement(statement) {
  assert(statement.entries.length>0,'O arquivo não contém movimentações reconhecidas.');
  assert(statement.opening!=null&&statement.snapshots.length>0,'Não foi possível identificar os saldos do extrato.');
  let running=statement.opening.value,previous='';
  const snapshots=new Map(statement.snapshots.map(snapshot=>[snapshot.index,snapshot]));
  for(const [index,row] of statement.entries.entries()) {
    assert(row.at>=previous,'Movimentações fora da ordem cronológica. Revise o arquivo.');previous=row.at;
    assert(row.history.length>0&&row.history.length<=4000,'Histórico inválido no extrato.');
    running+=row.value;assert(Number.isSafeInteger(running),'Soma de valores fora do limite.');
    const snapshot=snapshots.get(index);
    assert(!snapshot||snapshot.value===running,`Saldo inconsistente em ${row.at}: as movimentações não fecham com o saldo informado.`);
  }
  assert(snapshots.has(statement.entries.length-1),'Não foi encontrado saldo após a última movimentação.');
  return statement;
}
