import { controlRecords } from './registros.js';
import { qprofBase, qprofFilterOptions } from '../../importacao/qprof/service.js';
import { listExtrato } from '../extrato/service.js';
import { listRegistrations } from '../../gerenciador/shared/service.js';
import { transaction } from '../../../infrastructure/database/connection.js';
import { assert, positiveId } from '../../../shared/errors.js';
import { validateItems, saveItems } from './itens.js';
import { listTransfers, findTransfer, listItems } from './repository.js';

function validateTotal(items,amount) {
  const sum=items.reduce((total,item)=>total+(item.efeito==='compensacao'?0:item.valor),0);
  assert(Number.isSafeInteger(sum)&&sum===amount,'A soma dos itens deve ser exatamente igual ao valor da transferência.',422);
}
export function confirmTransfer(db,payload) {
  const extratoId=positiveId(payload.extrato_id);
  return transaction(db,()=>{
    const entry=db.prepare('SELECT * FROM workflow_extrato WHERE id=?').get(extratoId);
    assert(entry,'Movimentação não encontrada.',404);
    const account=db.prepare('SELECT funcao,status FROM gerenciador_contas WHERE id=?').get(entry.conta_id);
    assert(entry.rastreio_condicao!=='legado_sem_rastreio','Movimentação anterior ao início do controle: legado sem rastreio.',409);
    assert(account?.status==='active'&&account.funcao==='rastreada','A função da conta ativa deve ser Rastreada para compor o rastreio.',409);
    assert(!db.prepare('SELECT 1 FROM workflow_rastreio_transferencias WHERE extrato_id=?').get(entry.id),'Esta movimentação já possui rastreio. Atualize a fila.',409);
    const items=validateItems(db,payload.itens);
    assert(items.length,'Inclua pelo menos um item na composição.');validateTotal(items,Math.abs(entry.valor*100+entry.valor_subcentavos)/100);
    const result=db.prepare('INSERT INTO workflow_rastreio_transferencias(extrato_id) VALUES(?)').run(entry.id);
    const id=Number(result.lastInsertRowid);saveItems(db,id,items);
    // Qprof records and the Extrato control status are intentionally unchanged.
    return transferDetails(db,id);
  });
}
export function updateTransfer(db,id,payload) {
  id=positiveId(id);
  return transaction(db,()=>{
    const transfer=findTransfer(db,id);assert(transfer,'Rastreio não encontrado.',404);
    assert(Number.isSafeInteger(payload.versao)&&payload.versao===transfer.versao,'Esta transferência mudou desde a abertura. Atualize a página antes de salvar.',409);
    const items=validateItems(db,payload.itens,id);
    if(!items.length){db.prepare('DELETE FROM workflow_rastreio_transferencias WHERE id=?').run(id);return {deleted:true};}
    if(!transfer.origem_chave)validateTotal(items,transfer.valor);saveItems(db,id,items);
    db.prepare('UPDATE workflow_rastreio_transferencias SET versao=versao+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    return transferDetails(db,id);
  });
}
export function rastreioData(db) {
  return {registros:controlRecords(db),inicio_controle:db.prepare('SELECT inicio_controle FROM workflow_rastreio_configuracoes WHERE id=1').get().inicio_controle,extrato:listExtrato(db),base_qprof:qprofBase(db),filtros_qprof:qprofFilterOptions(db),transferencias:listTransfers(db),
    itens:db.prepare('SELECT i.*,r.status_origem,r.observacao FROM workflow_rastreio_itens i LEFT JOIN workflow_rastreio_registros r ON r.id=i.registro_id ORDER BY i.id').all(),
    contas:listRegistrations(db,'contas')};
}
export function associateTransfer(db,id,payload){
  return transaction(db,()=>{
    const transfer=findTransfer(db,positiveId(id));assert(transfer,'Transferência não encontrada.',404);
    assert(!transfer.extrato_id,'A transferência já está associada.',409);
    assert(payload.versao===transfer.versao,'A transferência mudou. Atualize a página.',409);
    const entry=db.prepare('SELECT * FROM workflow_extrato WHERE id=?').get(positiveId(payload.extrato_id));
    assert(entry&&entry.conta_id===transfer.conta_origem_id&&entry.data===transfer.data_origem&&entry.valor===transfer.valor_origem&&entry.valor_subcentavos===0,'Conta, data e valor devem coincidir com a transferência.');
    assert(!db.prepare('SELECT id FROM workflow_rastreio_transferencias WHERE extrato_id=?').get(entry.id),'Movimentação já utilizada por outra transferência.',409);
    db.prepare('UPDATE workflow_rastreio_transferencias SET extrato_id=?,versao=versao+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(entry.id,transfer.id);
    return transferDetails(db,transfer.id);
  });
}
export function transferDetails(db,id) {
  const transfer=findTransfer(db,positiveId(id));assert(transfer,'Transferência não encontrada.',404);
  return {...transfer,itens:listItems(db,transfer.id)};
}
