const transferQuery=`SELECT tr.*, COALESCE(e.data,tr.data_origem) data,COALESCE(e.historico,tr.descricao_origem) historico,
  COALESCE((e.valor*100+e.valor_subcentavos)/100.0,tr.valor_origem) movimento_valor,
  abs(COALESCE((e.valor*100+e.valor_subcentavos)/100.0,tr.valor_origem)) valor,
  CASE WHEN COALESCE(e.valor,tr.valor_origem)>0 THEN 'conciliacao' ELSE 'liquidacao' END tipo,
  e.status, COALESCE(e.conta_id,tr.conta_origem_id) conta_id, c.nome conta, en.nome entidade,
  COALESCE((SELECT SUM(i.valor) FROM workflow_rastreio_itens i WHERE i.transferencia_id=tr.id AND i.efeito='composicao'),0) total_composicao,
  (SELECT count(*) FROM workflow_rastreio_itens i WHERE i.transferencia_id=tr.id AND i.valor IS NULL) alocacoes_vazias,
  (SELECT count(*) FROM workflow_rastreio_itens i WHERE i.transferencia_id=tr.id AND i.valor=0) alocacoes_zero,
  (SELECT count(*) FROM workflow_rastreio_itens i WHERE i.transferencia_id=tr.id) quantidade_itens
  FROM workflow_rastreio_transferencias tr LEFT JOIN workflow_extrato e ON e.id=tr.extrato_id
  JOIN gerenciador_contas c ON c.id=COALESCE(e.conta_id,tr.conta_origem_id) LEFT JOIN gerenciador_entidades en ON en.id=e.entidade_id`;
export const listTransfers=db=>db.prepare(`${transferQuery} ORDER BY data DESC,tr.id DESC`).all().map(withDifference);
export const findTransfer=(db,id)=>withDifference(db.prepare(`${transferQuery} WHERE tr.id=?`).get(id));
function withDifference(row){
  if(!row)return row;
  const diferenca=row.valor-row.total_composicao;
  const reasons=[];
  if(row.alocacoes_vazias)reasons.push('Alocações não informadas');
  if(row.alocacoes_zero)reasons.push('Alocações zeradas');
  if(diferenca)reasons.push('Diferença na composição');
  return {...row,diferenca,pendente:reasons.length>0,motivos:reasons,associacao_pendente:!row.extrato_id};
}
export const listItems=(db,id)=>db.prepare(`SELECT i.*,r.status_origem,r.observacao,r.recebimentos FROM workflow_rastreio_itens i
  LEFT JOIN workflow_rastreio_registros r ON r.id=i.registro_id WHERE transferencia_id=? ORDER BY i.id`).all(id);
