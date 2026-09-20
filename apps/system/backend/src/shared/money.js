import { assert } from './errors.js';

export function parseCents(value,{allowZero=false}={}) {
  const text=String(value??'').trim();
  assert(/^-?\d+(\.\d{1,2})?$/.test(text),'Informe um valor com até duas casas decimais.');
  const [whole,fraction='']=text.replace('-','').split('.');
  const cents=(Number(whole)*100+Number(fraction.padEnd(2,'0')))*(text.startsWith('-')?-1:1);
  assert(Number.isSafeInteger(cents) && (allowZero||cents!==0) && Math.abs(cents)<=9000000000000,allowZero?'Informe um valor dentro do limite.':'Informe um valor diferente de zero e dentro do limite.');
  return cents;
}

// Integer cents plus a signed remainder in hundredths of a cent (four BRL decimals).
// Keep the established cent-based columns/API; never round imported financial values.
export function parseExactAmount(value,{allowZero=false}={}) {
  const text=String(value??'').trim();
  assert(/^-?\d+(\.\d{1,4})?$/.test(text),'Informe um valor com até quatro casas decimais.');
  const [whole,fraction='']=text.replace('-','').split('.');
  const units=(BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0')))*(text.startsWith('-')?-1n:1n);
  assert((allowZero||units!==0n)&&units>=-900000000000000n&&units<=900000000000000n,'Informe um valor diferente de zero e dentro do limite.');
  return {valor:Number(units/100n),valor_subcentavos:Number(units%100n)};
}
export function exactUnits(cents,remainder=0){return BigInt(cents)*100n+BigInt(remainder);}
export function exactDecimal(cents,remainder=0){
  const units=exactUnits(cents,remainder),abs=units<0n?-units:units;
  const fraction=String(abs%10000n).padStart(4,'0').replace(/0{1,2}$/,'');
  return `${units<0n?'-':''}${abs/10000n}.${fraction}`;
}
