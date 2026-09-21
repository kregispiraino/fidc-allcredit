import { titleIdentity, normalizeTitle } from '../../../shared/title-identity.js';
import { Worker } from 'node:worker_threads';
import { assert, AppError } from '../../../shared/errors.js';
import { transaction } from '../../../infrastructure/database/connection.js';
export const qprofBase=db=>db.prepare('SELECT versao,arquivo,quantidade,updated_at FROM importacao_qprof_base WHERE id=1').get();
export function qprofFilterOptions(db){
  return Object.fromEntries(['carteira','carteira_interna'].map(column=>[column,db.prepare(`SELECT DISTINCT ${column} valor FROM importacao_qprof_titulos WHERE ativo=1 AND ${column}<>'' ORDER BY ${column}`).all().map(row=>row.valor)]));
}
export function replaceQprof(db,rows,{filename,versao}){
  return transaction(db,()=>{
    assert(Number.isSafeInteger(versao)&&versao===qprofBase(db).versao,'A base Qprof foi atualizada por outra importação. Recarregue a página e selecione o arquivo novamente.',409);
    // Resolve the entire file before writing. Conflicting duplicates must not silently
    // replace a different amount/payment; exact repeats represent one catalog title.
    const unique=new Map();
    for(const row of rows){
      const key=titleIdentity(row),previous=unique.get(key);
      assert(!previous||(previous.valor===row.valor&&previous.data_liquidacao===row.data_liquidacao&&normalizeTitle(previous.sacado)===normalizeTitle(row.sacado)),`Título ${row.numero} repetido com dados de baixa divergentes. Revise o arquivo.`,422);
      unique.set(key,row);
    }
    const existing=new Map();
    for(const row of db.prepare('SELECT * FROM importacao_qprof_titulos ORDER BY id').all()){
      const key=titleIdentity(row);if(!existing.has(key))existing.set(key,row);
    }
    db.exec(`UPDATE workflow_rastreio_transferencias SET versao=versao+1 WHERE id IN
      (SELECT transferencia_id FROM workflow_rastreio_itens WHERE qprof_titulo_id IS NOT NULL);
      UPDATE importacao_qprof_titulos SET ativo=0 WHERE ativo=1;`);
    const insert=db.prepare('INSERT INTO importacao_qprof_titulos(numero,cedente,sacado,valor,data_liquidacao,carteira,carteira_interna) VALUES(?,?,?,?,?,?,?)');
    const update=db.prepare('UPDATE importacao_qprof_titulos SET numero=?,cedente=?,sacado=?,valor=?,data_liquidacao=?,carteira=?,carteira_interna=?,ativo=1,updated_at=CURRENT_TIMESTAMP WHERE id=?');
    for(const [key,row] of unique){
      const values=[row.numero,row.cedente,row.sacado,row.valor,row.data_liquidacao,row.carteira,row.carteira_interna],found=existing.get(key);
      if(found)update.run(...values,found.id);else insert.run(...values);
    }
    db.prepare('UPDATE importacao_qprof_base SET versao=versao+1,arquivo=?,quantidade=?,updated_at=CURRENT_TIMESTAMP WHERE id=1').run(filename,unique.size);
    return qprofBase(db);
  });
}
export async function importQprof(db,payload){
  const {filename,content,versao}=payload;
  assert(typeof filename==='string'&&filename.length<=200&&/\.(xlsx?|csv)$/i.test(filename),'Envie um arquivo .csv, .xlsx ou .xls.');
  assert(typeof content==='string'&&content.length<=Math.ceil(25*1024*1024/3)*4&&/^[A-Za-z0-9+/]+={0,2}$/.test(content),'Arquivo inválido ou maior que 25 MB.');
  const buffer=Buffer.from(content,'base64');
  assert(buffer.length>0&&buffer.length<=25*1024*1024&&buffer.toString('base64')===content,'Arquivo inválido ou maior que 25 MB.');
  assert(versao===qprofBase(db).versao,'A base Qprof foi atualizada. Recarregue a página antes de importar.',409);
  const rows=await new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./parser-worker.js',import.meta.url),{workerData:{buffer,filename},execArgv:[]});
    const timeout=setTimeout(()=>{worker.terminate();reject(new AppError('A leitura excedeu o tempo limite. A base anterior foi preservada.',422));},60000);
    worker.once('message',result=>{clearTimeout(timeout);if(result.error)reject(new AppError(result.error,result.status));else resolve(result.rows);});
    worker.once('error',error=>{clearTimeout(timeout);reject(error);});
    worker.once('exit',code=>{clearTimeout(timeout);if(code!==0)reject(new AppError('Não foi possível ler a planilha. A base anterior foi preservada.',422));});
  });
  return replaceQprof(db,rows,{filename,versao});
}
