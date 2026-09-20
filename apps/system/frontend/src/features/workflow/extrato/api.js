import { api } from '../../../services/api.js';
export const loadExtrato=()=>api('/workflow/extrato');
export const saveExtrato=items=>api('/workflow/extrato/batch',{method:'PUT',body:{items}});
export const deleteExtrato=id=>api(`/workflow/extrato/${id}`,{method:'DELETE'});
export const previewExtratoImport=body=>api('/workflow/extrato/importar/conferir',{method:'POST',body});
export const importExtratoSpreadsheet=body=>api('/workflow/extrato/importar',{method:'POST',body});
export async function exportExtratoSpreadsheet(ids){
  if(!ids.length)throw new Error('Não há registros para exportar.');
  const response=await fetch('/api/workflow/extrato/exportar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
  if(!response.ok)throw new Error((await response.json()).error||'Não foi possível exportar.');
  const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='extrato.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
