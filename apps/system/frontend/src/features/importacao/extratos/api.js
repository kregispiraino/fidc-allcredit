import { api } from '../../../services/api.js';
export const loadExtratos=()=>api('/importacao/extratos');
export { fileContent } from '../shared/file.js';
export const importExtrato=(key,body)=>api(`/importacao/extratos/${key}`,{method:'POST',body});
