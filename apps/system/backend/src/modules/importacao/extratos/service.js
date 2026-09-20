import { createHash } from 'node:crypto';
import { assert } from '../../../shared/errors.js';
import { transaction } from '../../../infrastructure/database/connection.js';
import { parseSingulare } from './parsers/singulare.js';
import { parseBradesco } from './parsers/bradesco.js';
import { normalize } from './parsers/common.js';
import { sourceByKey } from './sources.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const parsers={singulare:parseSingulare,bradesco:parseBradesco};
function validDate(value) {
  assert(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value),'Informe as datas inicial e final.');
  const date=new Date(`${value}T00:00:00Z`);
  assert(Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value,'Período de importação inválido.');return value;
}
export function parseStatement(source,buffer,filename) {
  assert(Buffer.isBuffer(buffer)&&buffer.length>0&&buffer.length<=8*1024*1024,'Envie um arquivo de até 8 MB.');
  assert(typeof filename==='string'&&filename.length>0&&filename.length<=240&&!/[\\/\x00-\x1f]/.test(filename),'Nome de arquivo inválido.');
  const statement=parsers[source.banco](buffer,filename);
  assert(statement.account===source.numero&&(!source.agencia||Number(statement.agency)===Number(source.agencia)),'O arquivo pertence a outra conta. Use o card da conta correta.');
  assert(statement.entries.length<=20000,'Extrato excede o limite de 20.000 movimentações.');
  return statement;
}
export function identifyEntries(statement) {
  const occurrences=new Map(),dayCounts=new Map();
  return statement.entries.map(row=>{
    // Bank documents disambiguate legitimate payments with the same timestamp/amount.
    // Bradesco has only a date; repeated identical rows retain their multiplicity.
    const identity=JSON.stringify([row.at,row.value,row.document,statement.bank==='bradesco'||!row.document?normalize(row.history):'']);
    const occurrence=(occurrences.get(identity)||0)+1;occurrences.set(identity,occurrence);
    const order=(dayCounts.get(row.date)||0)+1;dayCounts.set(row.date,order);
    return {...row,key:hash(`${identity}:${occurrence}`),order};
  });
}
export function importStatement(db,key,{filename,buffer,start,end}) {
  validDate(start);validDate(end);assert(start<=end,'A data inicial deve ser anterior ou igual à final.');
  const source=sourceByKey(db,key),statement=parseStatement(source,buffer,filename),all=identifyEntries(statement);
  const entries=all.filter(row=>row.date>=start&&row.date<=end);
  const candidate=statement.snapshots.filter(snapshot=>snapshot.at.slice(0,10)>=start&&snapshot.at.slice(0,10)<=end).at(-1);
  return transaction(db,()=>{
    const active=sourceByKey(db,key);assert(active.conta_id&&active.status==='active'&&active.funcao!=='neutra','A fonte precisa de uma conta ativa que permita movimentações.');
    const lot=Number(db.prepare('INSERT INTO importacao_extratos_lotes(fonte,arquivo,arquivo_hash,data_inicio,data_fim,criados,duplicados,fora_periodo) VALUES(?,?,?,?,?,0,0,?)').run(key,filename,hash(buffer),start,end,all.length-entries.length).lastInsertRowid);
    const known=db.prepare('SELECT 1 FROM importacao_extratos_registros WHERE conta_id=? AND chave=?');
    const insert=db.prepare("INSERT INTO workflow_extrato(status,data,historico,valor,conta_id) VALUES('pending',?,?,?,?)");
    const register=db.prepare('INSERT INTO importacao_extratos_registros(conta_id,chave,extrato_id,lote_id,data_hora,documento,valor) VALUES(?,?,?,?,?,?,?)');
    let created=0,duplicates=0;
    for(const row of entries){
      if(known.get(active.conta_id,row.key)){duplicates++;continue;}
      const id=Number(insert.run(row.date,row.history,row.value,active.conta_id).lastInsertRowid);
      register.run(active.conta_id,row.key,id,lot,row.at,row.document,row.value);created++;
    }
    const before=db.prepare('SELECT * FROM workflow_saldos WHERE conta_id=?').get(active.conta_id);
    const newer=candidate&&(!active.saldo_data||candidate.at>active.saldo_data||(candidate.at===active.saldo_data&&all[candidate.index].order>=active.saldo_ordem));
    // Never replace a more recent observation with an older statement.
    if(newer){
      assert(candidate.at!==active.saldo_data||all[candidate.index].order!==active.saldo_ordem||candidate.value===before.saldo_banco,'O saldo diverge de uma importação já registrada para a mesma posição. Revise o arquivo.');
      const updated=candidate.at.length===10?candidate.at:new Date(candidate.at.replace(' ','T')+'-03:00').toISOString().slice(0,19).replace('T',' ');
      db.prepare('UPDATE workflow_saldos SET saldo_banco=?,updated_at=? WHERE conta_id=?').run(candidate.value,updated,active.conta_id);
      db.prepare('UPDATE importacao_extratos_fontes SET saldo_data=?,saldo_ordem=? WHERE chave=?').run(candidate.at,all[candidate.index].order,key);
    }
    const current=db.prepare('SELECT * FROM workflow_saldos WHERE conta_id=?').get(active.conta_id);
    const matches=current.saldo_banco!==null&&current.saldo_sistema===current.saldo_banco&&current.saldo_sistema_subcentavos===0;
    if(matches&&entries.length)db.prepare('UPDATE workflow_saldos SET saldo_final=saldo_banco WHERE conta_id=?').run(active.conta_id);
    db.prepare('UPDATE importacao_extratos_lotes SET criados=?,duplicados=?,saldo_data=?,saldo_atualizado=? WHERE id=?').run(created,duplicates,candidate?.at||null,newer?1:0,lot);
    return {lote:lot,criados:created,duplicados:duplicates,fora_periodo:all.length-entries.length,saldo_atualizado:!!newer,
      saldo_data:sourceByKey(db,key).saldo_data,saldo_sistema:current.saldo_sistema,saldo_banco:current.saldo_banco,saldo_final_automatico:matches&&entries.length>0,
      aviso:!entries.length?'Nenhuma movimentação no período selecionado.':candidate&&!newer?'O saldo mais recente foi preservado.':!matches?'Saldos diferentes: o saldo final foi mantido para conferência.':null};
  });
}
