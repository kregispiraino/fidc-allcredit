import { loadSession } from '../features/sistema/sessao/client.js';
import { showLogin } from '../features/sistema/sessao/login.js';
import { captureTableViewport, restoreTableViewport } from '../components/tables/table-viewport.js';
import { initializeStandardSelects } from '../components/forms/standard-select.js';
import { initializeStandardInputs } from '../components/forms/standard-input.js';
import { renderShell } from '../layouts/shell.js';
import { pages } from './pages.js';
import { resolveRoute, routeHash, pageKey } from './routes.js';
import { esc, notify } from '../utils/presentation.js';

const state={...resolveRoute(location.hash),pages:{}};
let cleanups=[],data,request=0,loadedPage=null,routePending=false,session=null;
const root=document.querySelector('#pageCanvas'),actions=document.querySelector('#pageActions');
const ctx={root,actions,state,notify,get data(){return data;},get session(){return session;},get usuario(){return session?.usuario;},get canWrite(){return session?.usuario?.acesso==='operador';},
  get pageState(){return state.pages[pageKey(state)]??={};},render,refresh,
  onCleanup:fn=>cleanups.push(fn),navigate:(section,page,tab)=>{location.hash=routeHash({section,page,tab});}};
const standardSelects=initializeStandardSelects(),standardInputs=initializeStandardInputs(document.body,{notify});

function clearPage() {
  cleanups.splice(0).forEach(fn=>fn());actions.innerHTML='';ctx.beforeLeave=null;ctx.hasUnsaved=()=>false;root.onkeydown=null;
}
function render() {
  const viewport=captureTableViewport(root),tableIntent=ctx.tableIntent;ctx.tableIntent=null;
  const focused=document.activeElement,id=focused?.id,cursor=focused?.selectionStart;
  clearPage();renderShell(ctx);
  if(!data){root.innerHTML='<div class="loading-state" role="status"><span class="loading-dot"></span>Carregando…</div>';return;}
  pages[pageKey(state)].render(ctx);
  standardSelects.refresh();standardInputs.refresh();
  restoreTableViewport(root,viewport,tableIntent);
  if(id){const target=document.getElementById(id);if(target&&target!==root){target.focus({preventScroll:true});if(cursor!=null)try{target.setSelectionRange(cursor,cursor);}catch{}}}
}
function showLoadError(error) {
  clearPage();root.innerHTML=`<div class="loading-state" role="alert"><strong>Não foi possível carregar os dados.</strong><p>${esc(error.message)}</p><button class="form-action primary" data-retry>Tentar novamente</button></div>`;
  root.querySelector('[data-retry]').onclick=()=>{data=null;render();refresh().catch(showLoadError);};
}
async function refresh() {
  const sequence=++request,key=pageKey(state),page=pages[key];
  try {
    const updated=page.load?await page.load():{};
    if(sequence!==request||key!==pageKey(state))return;
    data=updated;loadedPage=key;render();
  }catch(error){if(sequence===request&&key===pageKey(state))throw error;}
}
async function route() {
  if(routePending||!session?.usuario)return;
  const next=resolveRoute(location.hash);
  if(ctx.beforeLeave){
    routePending=true;
    const leave=await ctx.beforeLeave();routePending=false;
    if(!leave){history.replaceState(null,'',routeHash(state));return;}
  }
  Object.assign(state,next);history.replaceState(null,'',routeHash(state));
  if(loadedPage===pageKey(state)&&data){render();if(pages[pageKey(state)].refreshOnTab)await refresh().catch(showLoadError);return;}
  data=null;render();await refresh().catch(showLoadError);
}
window.addEventListener('hashchange',route);
window.addEventListener('beforeunload',event=>{if(ctx.hasUnsaved?.()){event.preventDefault();event.returnValue='';}});
document.querySelector('.skip-link').onclick=event=>{event.preventDefault();root.focus();};
async function boot(){
  try{
    session=await loadSession();
    if(!session.usuario){showLogin(session);return;}
    document.body.dataset.authenticated='true';document.querySelector('#loginRoot').hidden=true;
    await route();
  }catch(error){
    const login=document.querySelector('#loginRoot');login.hidden=false;
    login.innerHTML=`<main class="login-page"><section class="login-card"><h1>Não foi possível conectar</h1><p>${esc(error.message)}</p><button class="login-submit" data-retry-login>Tentar novamente</button></section></main>`;
    login.querySelector('[data-retry-login]').onclick=boot;
  }
}
boot();
