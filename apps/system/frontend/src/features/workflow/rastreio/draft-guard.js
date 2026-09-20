import { confirmDestructiveAction } from '../../../components/modals/confirmation-modal.js';
export function bindDraftGuard(ctx){
  const dirty=()=>Object.values(ctx.pageState).some(state=>Object.values(state.drafts||{}).some(draft=>draft.dirty));
  ctx.hasUnsaved=dirty;
  ctx.beforeLeave=async()=>{
    if(location.hash.startsWith('#workflow/rastreio')||!dirty())return true;
    const leave=await confirmDestructiveAction({title:'Sair sem salvar?',message:'Há composições com alterações locais.',actionLabel:'Descartar alterações',warning:'As alterações não salvas serão descartadas.'});
    if(leave)for(const state of Object.values(ctx.pageState))if(state.drafts&&typeof state.drafts==='object'&&!state.drafts.records)state.drafts={};return leave;
  };
}
