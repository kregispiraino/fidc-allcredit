import { esc,notify } from '../../../utils/presentation.js';
import { openForm } from '../../../components/modals/form-modal.js';
import { initials,roleLabel,signIn,switchAccount,signOut,sessionChanged } from './client.js';
import { loginFields,bindPassword } from './login.js';
const avatar=user=>esc(initials(user.login));
export function bindProfile(ctx){
  const trigger=document.querySelector('[data-profile-trigger]');
  trigger.onclick=()=>{
    if(document.querySelector('.account-popover')){document.querySelector('.account-popover').hidePopover();return;}
    const user=ctx.usuario,card=document.createElement('div');card.className='account-popover';card.setAttribute('popover','auto');card.id='accountPopover';
    card.innerHTML=`<div class="account-current"><span class="account-avatar account-avatar-large" role="img" aria-label="Iniciais de ${esc(user.login)}">${avatar(user)}</span><div><strong>${esc(user.login)}</strong><span>${roleLabel(user.acesso)}</span></div></div><div class="account-list"><span class="account-section-label">Contas neste navegador</span>${ctx.session.contas.map(account=>`<button type="button" class="account-choice" data-switch-account="${account.id}" ${account.id===user.id?'disabled aria-current="true"':''}><span class="account-avatar">${avatar(account)}</span><span><strong>${esc(account.login)}</strong><small>${roleLabel(account.acesso)}</small></span>${account.id===user.id?'<span class="account-active">Atual</span>':''}</button>`).join('')}</div><div class="account-actions"><button type="button" data-add-account><span aria-hidden="true">＋</span> Adicionar conta</button><button type="button" data-sign-out aria-label="Sair de ${esc(user.login)}">Sair</button>${ctx.session.contas.length>1?'<button type="button" data-sign-out-all>Sair de todas as contas</button>':''}</div>`;
    document.body.append(card);card.showPopover();trigger.setAttribute('aria-expanded','true');
    const place=()=>{const rect=trigger.getBoundingClientRect();card.style.left=`${Math.min(rect.right+12,innerWidth-card.offsetWidth-12)}px`;card.style.top=`${Math.max(12,Math.min(rect.bottom-card.offsetHeight,innerHeight-card.offsetHeight-12))}px`;};place();
    const close=()=>{if(card.isConnected)card.hidePopover();};ctx.onCleanup(close);
    card.addEventListener('toggle',event=>{if(event.newState==='closed'){trigger.setAttribute('aria-expanded','false');card.remove();}},{once:false});
    const act=async action=>{try{if(ctx.beforeLeave&&!await ctx.beforeLeave())return;await action();sessionChanged();}catch(error){notify(error.message);}};
    card.querySelectorAll('[data-switch-account]').forEach(button=>button.onclick=()=>act(()=>switchAccount(Number(button.dataset.switchAccount))));
    card.querySelector('[data-sign-out]').onclick=()=>act(()=>signOut(false));
    card.querySelector('[data-sign-out-all]')?.addEventListener('click',()=>act(()=>signOut(true)));
    card.querySelector('[data-add-account]').onclick=async()=>{
      if(ctx.beforeLeave&&!await ctx.beforeLeave())return;close();
      const dialog=openForm({title:'Adicionar conta',description:'Entre com outro acesso cadastrado. Sua conta atual continuará disponível.',content:`<div class="account-login-fields">${loginFields()}</div>`,submitLabel:'Entrar',onSubmit:async form=>{await signIn(Object.fromEntries(form));sessionChanged();}});bindPassword(dialog);
    };

  };
}
