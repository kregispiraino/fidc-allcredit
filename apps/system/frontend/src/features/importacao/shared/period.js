export function defaultImportPeriod(today=new Date()) {
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(today);
  const previous=new Date(`${date}T12:00:00Z`);previous.setUTCDate(previous.getUTCDate()-1);
  while([0,6].includes(previous.getUTCDay()))previous.setUTCDate(previous.getUTCDate()-1);
  return {start:previous.toISOString().slice(0,10),end:date};
}
