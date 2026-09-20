import { assert, positiveId } from '../../../shared/errors.js';

export const itemTypes=['titulo','parcial','tarifa','custas','ajuste'];
// Compatibility is restricted to provenance/imports; API writes use itemTypes.
export const normalizeImportedType=type=>['ajuste_saldo','recebimento_sem_titulo','devolucao_ajuste','divergencia'].includes(type)?'ajuste':type;
export function ensureControlRecord(db,item){
  if(item.registro_id){assert(db.prepare('SELECT 1 FROM workflow_rastreio_registros WHERE id=?').get(item.registro_id),'Registro de rastreio inexistente.');return item.registro_id;}
  const key=item.qprof_titulo_id?`qprof:${item.qprof_titulo_id}`:null;
  const found=key?db.prepare('SELECT id FROM workflow_rastreio_registros WHERE origem_chave=?').get(key):null;
  if(found)return found.id;
  return Number(db.prepare(`INSERT INTO workflow_rastreio_registros(origem_chave,tipo,titulo,cedente,sacado,valor,data_liquidacao)
    VALUES(?,?,?,?,?,?,?)`).run(key,item.tipo,item.titulo,item.cedente,item.sacado,item.valor??0,item.data_liquidacao).lastInsertRowid);
}

export function controlRecords(db){
  const rows=db.prepare(`SELECT r.*,count(i.id) vinculos,
    sum(CASE WHEN i.efeito='composicao' AND COALESCE(e.valor,t.valor_origem)>0 THEN 1 ELSE 0 END) creditos,
    sum(CASE WHEN i.efeito='composicao' AND COALESCE(e.valor,t.valor_origem)<0 THEN 1 ELSE 0 END) debitos,
    COALESCE(sum(CASE WHEN i.efeito='composicao' AND COALESCE(e.valor,t.valor_origem)>0 THEN i.valor ELSE 0 END),0) total_credito,
    COALESCE(sum(CASE WHEN i.efeito='composicao' AND COALESCE(e.valor,t.valor_origem)<0 THEN i.valor ELSE 0 END),0) total_debito,
    sum(CASE WHEN i.id IS NOT NULL AND i.valor IS NULL THEN 1 ELSE 0 END) alocacoes_vazias,
    sum(CASE WHEN i.id IS NOT NULL AND i.valor=0 THEN 1 ELSE 0 END) alocacoes_zero,
    group_concat(DISTINCT CASE WHEN i.efeito='composicao' AND COALESCE(e.valor,t.valor_origem)>0 THEN t.codigo END) codigos_credito,
    group_concat(DISTINCT CASE WHEN i.efeito='composicao' AND COALESCE(e.valor,t.valor_origem)<0 THEN t.codigo END) codigos_debito
     ,COALESCE((SELECT sum(c.valor) FROM workflow_rastreio_itens c WHERE c.compensa_registro_id=r.id AND c.efeito='compensacao'),0) total_compensado
    FROM workflow_rastreio_registros r LEFT JOIN workflow_rastreio_itens i ON i.registro_id=r.id
    LEFT JOIN workflow_rastreio_transferencias t ON t.id=i.transferencia_id LEFT JOIN workflow_extrato e ON e.id=t.extrato_id
    GROUP BY r.id ORDER BY r.data_liquidacao DESC,r.id DESC`).all();
  return rows.map(controlState);
}
export function controlState(row){
  const saldoAntes=row.alocacoes_vazias?null:row.total_credito-row.total_debito;
  const saldo=saldoAntes===null?null:saldoAntes-(row.total_compensado||0);
  const title=['titulo','parcial'].includes(row.tipo),provisional=!row.revisado_em&&row.status_origem==='VÍNCULO PROVISÓRIO';
  const unidentifiedReceipt=row.tipo==='ajuste'&&row.status_origem==='SEM TÍTULO / EM CONCILIAÇÃO';
  let situacao='aplicado',fase='revisao';
  if(provisional)situacao='vinculo_provisorio';
  else if(row.tipo==='ajuste'&&row.status_origem==='PENDENTE DE IDENTIFICAÇÃO'&&!row.revisado_em)situacao='divergencia';
  else if(row.alocacoes_vazias||row.alocacoes_zero){situacao='alocacao_incompleta';fase=row.creditos?'liquidacao':'conciliacao';}
  else if(title&&row.total_compensado>0&&saldo===0)situacao='compensado';
  else if(title||unidentifiedReceipt){
    if(!row.creditos){situacao='sem_credito';fase='conciliacao';}
    else if(!row.debitos||saldo>0){situacao=unidentifiedReceipt?'recebimento_sem_titulo':'em_conciliacao';fase='liquidacao';}
    else if(saldo<0)situacao='divergencia';
    else situacao='liquidado';
  }else if(!row.vinculos)situacao='sem_vinculo';
  if(row.pendencia_dispensa&&situacao==='em_conciliacao')situacao='dispensado';
  const pendente=!['liquidado','aplicado','compensado','dispensado'].includes(situacao);
  // A fila de saída acompanha recebimentos ainda não totalmente destinados.
  // Outras inconsistências continuam no percurso e nas filas das transferências.
  const aguarda_saida=pendente&&(title||unidentifiedReceipt)&&row.creditos>0&&(saldo===null||saldo>0);
  return {...row,saldo_antes_compensacao:saldoAntes,saldo_calculado:saldo,situacao,fase,pendente,aguarda_saida};
}
export function controlDetails(db,id){
  id=positiveId(id);const row=controlRecords(db).find(row=>row.id===id);assert(row,'Registro não encontrado.',404);
  const vinculos=db.prepare(`SELECT i.id,i.valor,i.efeito,i.compensa_registro_id,i.valor_alocado_origem,i.origem_posicao,i.data_alocacao_origem,t.id transferencia_id,t.codigo,t.extrato_id,t.status_origem,t.observacao,
    COALESCE(e.data,t.data_origem) data,CASE WHEN i.efeito='composicao' AND COALESCE(e.valor,t.valor_origem)>0 THEN 'conciliacao' ELSE 'liquidacao' END tipo
    FROM workflow_rastreio_itens i JOIN workflow_rastreio_transferencias t ON t.id=i.transferencia_id
    LEFT JOIN workflow_extrato e ON e.id=t.extrato_id WHERE i.registro_id=? ORDER BY data,t.codigo,i.id`).all(id);
  const compensacoes=db.prepare(`SELECT i.id,i.valor,i.cedente,t.codigo,t.id transferencia_id FROM workflow_rastreio_itens i JOIN workflow_rastreio_transferencias t ON t.id=i.transferencia_id WHERE i.compensa_registro_id=? AND i.efeito='compensacao'`).all(id);
  return {...row,vinculos,compensacoes};
}
