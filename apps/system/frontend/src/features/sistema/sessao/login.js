import { esc } from '../../../utils/presentation.js';
import { signIn,switchAccount,sessionChanged,initials,roleLabel } from './client.js';
export function loginFields(){return `<label class="login-field"><span>Usuário</span><input name="login" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="64" required autofocus placeholder="Seu login"></label><label class="login-field"><span>Senha</span><span class="login-password"><input name="senha" type="password" autocomplete="current-password" maxlength="128" required placeholder="Sua senha"><button type="button" data-password-visibility aria-label="Mostrar senha" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></span></label>`;}
export function bindPassword(root){
  const button=root.querySelector('[data-password-visibility]'),input=root.querySelector('[name=senha]');
  button.onclick=()=>{const show=input.type==='password';input.type=show?'text':'password';button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');};
}
export function showLogin(session){
  document.body.dataset.authenticated='false';document.title='Entrar · ALLCREDIT FIDC System';
  const root=document.querySelector('#loginRoot');root.hidden=false;
  root.innerHTML=`<main class="login-page"><section class="login-card" aria-label="Entrar no sistema"><div class="login-brand"><img src="/assets/allcredit-logo.png" alt="All Credit"></div><form class="login-form">${loginFields()}<p class="login-error" role="alert" hidden></p><button type="submit" class="login-submit">Entrar</button></form>${session.contas.length?`<div class="login-saved"><span>Contas neste navegador</span>${session.contas.map(user=>`<button type="button" data-login-account="${user.id}"><span class="account-avatar">${esc(initials(user.login))}</span><span>${esc(user.login)}<small>${roleLabel(user.acesso)}</small></span></button>`).join('')}</div>`:''}</section></main>`;
  bindPassword(root);const form=root.querySelector('form'),error=root.querySelector('.login-error');
  form.onsubmit=async event=>{
    event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;button.textContent='Entrando…';error.hidden=true;
    try{await signIn(Object.fromEntries(new FormData(form)));sessionChanged();}
    catch(err){error.textContent=err.message;error.hidden=false;button.disabled=false;button.textContent='Entrar';}
  };
  root.querySelectorAll('[data-login-account]').forEach(button=>button.onclick=async()=>{try{await switchAccount(Number(button.dataset.loginAccount));sessionChanged();}catch(err){error.textContent=err.message;error.hidden=false;}});
}
