import { api } from '../../../services/api.js';
export const loadSaldos=()=>api('/workflow/saldos');
export const saveSaldos=items=>api('/workflow/saldos/batch',{method:'PUT',body:{items}});
