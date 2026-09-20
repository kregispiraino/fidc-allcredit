import { api } from '../../../services/api.js';
export const roleLabel=role=>role==='operador'?'Operador':'Visualizador';
export const initials=login=>login.split(/[._\s-]+/).filter(Boolean).map(part=>part[0]).join('').slice(0,2).toUpperCase()||(login[0]||'').toUpperCase();
export const loadSession=()=>api('/sistema/sessao');
export const signIn=body=>api('/sistema/sessao/entrar',{method:'POST',body});
export const switchAccount=acesso_id=>api('/sistema/sessao/trocar',{method:'POST',body:{acesso_id}});
export const signOut=todas=>api('/sistema/sessao/sair',{method:'POST',body:{todas}});
const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('allcredit-fidc-session');
channel?.addEventListener('message',()=>location.reload());
export function sessionChanged(){channel?.postMessage('changed');location.reload();}
window.addEventListener('session-expired',()=>location.reload());
