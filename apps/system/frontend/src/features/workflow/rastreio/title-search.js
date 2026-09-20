import { searchQprof } from '../../importacao/qprof/api.js';
const filterKeys=['titulo','cedente','sacado','valor','data_liquidacao','carteira','carteira_interna'];
// Only one page is kept per tab. Replacing a query cancels its timer and request.
export function titleSearch(ctx,work){
  const filters=Object.fromEntries(Object.entries(work.filters).filter(([key])=>filterKeys.includes(key)));
  const query={q:work.query.trim(),filters,page:work.page};
  const key=JSON.stringify({...query,versao:ctx.data.base_qprof.versao});
  if(work.search?.key===key)return work.search;
  clearTimeout(work.search?.timer);work.search?.controller?.abort();
  const active=!!query.q||Object.values(filters).some(value=>typeof value==='object'?Object.values(value).some(Boolean):String(value).trim());
  const state=work.search={key,query,items:[],total:0,pages:1,loading:active,message:active?'Buscando títulos…':'Use a busca ou os filtros para consultar a base Qprof.'};
  if(!active)return state;
  const tab=ctx.state.tab;
  const current=()=>ctx.state.section==='workflow'&&ctx.state.page==='rastreio'&&ctx.state.tab===tab&&work.titleTab==='todos'&&work.search===state;
  const draw=()=>{if(!current())return;if(document.querySelector('.standard-table-filter')){setTimeout(draw,100);return;}ctx.render();};
  state.controller=new AbortController();
  state.timer=setTimeout(async()=>{
    try{
      const result=await searchQprof(query,state.controller.signal);
      if(work.search!==state)return;
      Object.assign(state,result,{loading:false,message:result.requiresFilter?'Use a busca ou os filtros para consultar a base Qprof.':'Nenhum título encontrado para esta busca.'});
      if(work.page!==result.page){work.page=result.page;state.key=JSON.stringify({...query,page:result.page,versao:ctx.data?.base_qprof?.versao});}
      draw();
    }catch(error){if(error.name==='AbortError'||work.search!==state)return;state.loading=false;state.error=true;state.message=error.message;draw();}
  },250);
  return state;
}
