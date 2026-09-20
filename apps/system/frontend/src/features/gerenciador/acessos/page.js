import { api } from '../../../services/api.js';
import { renderListing,listingState } from '../../../components/tables/listing.js';
import { openForm,selectField } from '../../../components/modals/form-modal.js';
import { confirmDestructiveAction } from '../../../components/modals/confirmation-modal.js';
import { esc,notify } from '../../../utils/presentation.js';
const roles=[{value:'operador',label:'Operador'},{value:'visualizador',label:'Visualizador'}];
function edit(ctx,user){
  openForm({title:user?'Editar acesso':'Cadastrar acesso',description:user?'Deixe a senha vazia para manter a atual.':'Operador altera dados. Visualizador consulta e exporta.',
    content:`<div class="form-grid"><label class="form-field"><span>Login</span><input name="login" value="${esc(user?.login||'')}" required maxlength="64" autocomplete="off" pattern="[A-Za-z0-9][A-Za-z0-9._-]*"></label><label class="form-field"><span>${user?'Nova senha':'Senha'}</span><input name="senha" type="password" ${user?'':'required'} minlength="6" maxlength="128" autocomplete="new-password" placeholder="${user?'Manter a senha atual':'Mínimo de 6 caracteres'}"></label>${selectField('acesso','Acesso',roles,user?.acesso||'visualizador')}</div>`,
    onSubmit:async form=>{
      await api(`/gerenciador/acessos${user?`/${user.id}`:''}`,{method:user?'PUT':'POST',body:Object.fromEntries(form)});
      // Changing the current user's credentials/role also refreshes this session's UI.
      if(user?.id===ctx.usuario.id){location.reload();return;}
      await ctx.refresh();notify('Acesso salvo.');
    }});
}
function render(ctx){
  const state=ctx.pageState.listing??=listingState();
  renderListing(ctx,{state,kind:'gerenciador-acessos',rows:ctx.data.acessos,showNew:false,showEdit:false,showDuplicate:false,
    fields:[{key:'login',label:'Login',type:'text'},{key:'senha',label:'Senha',readOnly:true,display:()=> '••••••••'},{key:'acesso',label:'Acesso',type:'select',options:roles,display:r=>roles.find(role=>role.value===r.acesso)?.label}],
    toolbarActions:ctx.canWrite?[{key:'new-access',label:'Cadastrar acesso'}]:[],onAction:()=>edit(ctx),
    rowActions:r=>ctx.canWrite?`<div class="compact-row-actions"><button type="button" class="text-link" data-access-edit="${r.id}">Editar</button><button type="button" class="text-link access-delete" data-access-delete="${r.id}">Excluir</button></div>`:'',
    exportRow:r=>({Login:r.login,Acesso:roles.find(role=>role.value===r.acesso)?.label})});
  ctx.root.querySelectorAll('[data-access-edit]').forEach(b=>b.onclick=()=>edit(ctx,ctx.data.acessos.find(u=>u.id===Number(b.dataset.accessEdit))));
  ctx.root.querySelectorAll('[data-access-delete]').forEach(b=>b.onclick=async()=>{
    const user=ctx.data.acessos.find(u=>u.id===Number(b.dataset.accessDelete));
    if(!await confirmDestructiveAction({message:`Excluir o acesso “${user.login}”?`,warning:'As sessões deste usuário serão encerradas.'}))return;
    try{await api(`/gerenciador/acessos/${user.id}`,{method:'DELETE'});if(user.id===ctx.usuario.id)location.reload();else await ctx.refresh();}catch(error){notify(error.message);}
  });
}
export default {load:()=>api('/gerenciador/acessos'),render};
