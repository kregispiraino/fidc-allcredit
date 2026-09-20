import { openForm,selectField } from '../../../components/modals/form-modal.js';
import { api } from '../../../services/api.js';
import { notify } from '../../../utils/presentation.js';
export function associateMovement(ctx,transfer){
  const used=new Set(ctx.data.transferencias.map(t=>t.extrato_id));
  const matches=ctx.data.extrato.filter(e=>e.conta_id===transfer.conta_origem_id&&e.data===transfer.data_origem&&e.valor===transfer.valor_origem&&!e.valor_subcentavos&&!used.has(e.id));
  if(!matches.length){notify('Nenhuma movimentação disponível com a mesma conta, data e valor. Importe ou cadastre a movimentação real antes de associar.');return;}
  openForm({title:`Associar ${transfer.codigo}`,description:'Escolha a movimentação correspondente. O vínculo não cria nem altera lançamentos financeiros.',submitLabel:'Associar movimentação',
    content:selectField('extrato_id','Movimentação',matches.map(e=>({value:e.id,label:`Extrato #${e.id} · ${e.historico}`}))),
    onSubmit:async form=>{await api(`/workflow/rastreio/transferencias/${transfer.id}/movimentacao`,{method:'PATCH',body:{extrato_id:Number(form.get('extrato_id')),versao:transfer.versao}});await ctx.refresh();notify('Movimentação associada.');}});
}
