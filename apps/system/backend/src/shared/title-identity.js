// Preserve leading zeros and installment digits; ignore presentation differences.
export const normalizeTitle=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');
export const titleIdentity=row=>JSON.stringify([normalizeTitle(row.titulo??row.numero),normalizeTitle(row.cedente)]);
export function titleGroups(rows){
  const numbers=new Map();
  for(const row of rows){
    const number=normalizeTitle(row.titulo??row.numero);
    if(!numbers.has(number))numbers.set(number,new Map());
    const parties=numbers.get(number),party=normalizeTitle(row.cedente);
    if(!parties.has(party))parties.set(party,[]);
    parties.get(party).push(row);
  }
  const result=[];
  for(const parties of numbers.values()){
    // Missing metadata may match a number only when there is no ambiguity.
    if(parties.has('')&&parties.size===2){const other=[...parties.keys()].find(Boolean);parties.get(other).push(...parties.get(''));parties.delete('');}
    result.push(...parties.values());
  }
  return result;
}
