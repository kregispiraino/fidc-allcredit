import { loadTransferDetails } from './api.js';
import { openForm } from '../../../components/modals/form-modal.js';
import { esc, money, date } from '../../../utils/presentation.js';
import { itemLabel } from './item-form.js';
export async function traceTransfer(id) {
  const transfer=await loadTransferDetails(id);
  const dialog=openForm({title:`Composição ${transfer.codigo}`,description:`${date(transfer.data)} · ${money(transfer.valor)} · ${transfer.conta} · ${transfer.extrato_id?`Extrato #${transfer.extrato_id}`:'Sem movimentação associada'}`,wide:true,readOnly:true,
    content:`<div class="table-scroll"><table class="title-table"><thead><tr><th>Tipo</th><th>Título</th><th>Cedente</th><th>Sacado</th><th>Valor</th></tr></thead><tbody>${transfer.itens.map(item=>`<tr><td>${itemLabel(item.tipo)}${item.efeito==='compensacao'?'<span class="cell-sub">Compensação de saldo · não soma ao total bancário</span>':''}</td><td>${esc(item.titulo||'—')}</td><td>${esc(item.cedente||'—')}</td><td>${esc(item.sacado||'—')}</td><td class="money">${item.valor===null?'Não informado':money(item.valor)}</td></tr>`).join('')}</tbody></table></div><p class="statement-notice">Total: ${money(transfer.total_composicao)} · Diferença: ${money(transfer.diferenca)}</p><a class="text-link" href="#workflow/rastreio/rastreio" data-open-review>Editar na aba Rastreio</a>`});
  dialog.querySelector('[data-open-review]').onclick=()=>dialog.close();
}
