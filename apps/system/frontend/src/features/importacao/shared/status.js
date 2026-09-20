const timeZone='America/Sao_Paulo';
const dayFormat=new Intl.DateTimeFormat('sv-SE',{timeZone});
const timestampFormat=new Intl.DateTimeFormat('pt-BR',{timeZone,dateStyle:'short',timeStyle:'medium'});

export function importStatus(lastImport,now=new Date()) {
  // SQLite timestamps are UTC; compare calendar days in the same zone shown to the operator.
  const value=String(lastImport||'').replace(' ','T');
  const timestamp=new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)?value:`${value}Z`);
  const valid=!!lastImport&&Number.isFinite(timestamp.getTime());
  return {
    updated:valid&&dayFormat.format(timestamp)===dayFormat.format(now),
    dateLabel:valid?timestampFormat.format(timestamp):'Nenhuma importação realizada'
  };
}
