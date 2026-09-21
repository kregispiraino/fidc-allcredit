import { renderPendencias } from './pendencias.js';
import { bindDraftGuard } from './draft-guard.js';
import { renderComposition } from './composicao.js';
import { loadRastreio } from './api.js';
import { pageDefinition } from '../../../app/routes.js';
import { renderMultiViewTopline } from '../../../components/navigation/operation-topline.js';
function render(ctx) {
  const stats=ctx.state.tab==='pendencias'?renderPendencias(ctx):renderComposition(ctx);
  bindDraftGuard(ctx);
  ctx.root.insertAdjacentHTML('afterbegin',renderMultiViewTopline({tabs:pageDefinition(ctx.state).tabs,activeKey:ctx.state.tab,stats,label:'Rastreio'}));
  ctx.root.querySelectorAll('[data-page-tab]').forEach(button=>button.onclick=()=>ctx.navigate('workflow','rastreio',button.dataset.pageTab));
}
export default {load:loadRastreio,render,refreshOnTab:true};
