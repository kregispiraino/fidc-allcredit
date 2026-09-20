import { renderListing, listingState } from '../../../components/tables/listing.js';
import { money, date } from '../../../utils/presentation.js';
import { loadSaldos, saveSaldos } from './api.js';
const amount=(value,fraction=0)=>value==null?'—':money(value,fraction);
const reais=(value,fraction=0)=>value==null?'':((value*100+fraction)/10000).toFixed(fraction?4:2);
const updated=value=>value.length===10?date(value):new Date(value.replace(' ','T')+'Z').toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
function render(ctx) {
  const state=ctx.pageState.listing??=listingState();
  const rows=ctx.data.saldos.map(row=>({...row,id:row.conta_id,saldo_final_reais:reais(row.saldo_final)}));
  const fields=[
    {key:'conta',label:'Conta',type:'text',readOnly:true},
    {key:'saldo_sistema',label:'Saldo Sistema',type:'number',format:'money',precision:4,readOnly:true,display:row=>amount(row.saldo_sistema,row.saldo_sistema_subcentavos),filterValue:row=>(row.saldo_sistema*100+row.saldo_sistema_subcentavos)/10000},
    {key:'saldo_banco',label:'Saldo Banco',type:'number',format:'money',readOnly:true,display:row=>amount(row.saldo_banco),filterValue:row=>row.saldo_banco==null?null:row.saldo_banco/100},
    {key:'saldo_final_reais',label:'Saldo final',type:'number',format:'money',display:row=>amount(row.saldo_final)},
    {key:'updated_at',label:'Atualização',type:'text',readOnly:true,display:row=>updated(row.updated_at)}
  ];
  renderListing(ctx,{state,rows,fields,kind:'saldos',showNew:false,showDuplicate:false,onSave:saveSaldos,
    exportRow:row=>({Conta:row.conta,'Saldo Sistema':reais(row.saldo_sistema,row.saldo_sistema_subcentavos),'Saldo Banco':reais(row.saldo_banco),'Saldo final':reais(row.saldo_final),'Atualização':updated(row.updated_at)})});
  ctx.root.querySelector('.standard-data-table').classList.add('saldos-table');
}
export default {load:loadSaldos,render};
