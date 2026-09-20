import { api } from '../../../services/api.js';
export const loadQprof=()=>api('/importacao/qprof');
export const importQprof=body=>api('/importacao/qprof',{method:'POST',body});
export const searchQprof=({q,filters,page},signal)=>api(`/importacao/qprof/titulos?${new URLSearchParams({q,filters:JSON.stringify(filters),page})}`,{signal});

export const selectQprof=body=>api('/importacao/qprof/titulos/selecao',{method:'POST',body});
