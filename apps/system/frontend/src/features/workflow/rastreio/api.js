import { api } from '../../../services/api.js';
export const loadRastreio=()=>api('/workflow/rastreio');
export const confirmRastreio=body=>api('/workflow/rastreio/transferencias',{method:'POST',body});
export const loadTransferDetails=id=>api(`/workflow/rastreio/transferencias/${id}`);

export const updateRastreio=(id,body)=>api(`/workflow/rastreio/transferencias/${id}`,{method:'PUT',body});
export async function downloadCompositionPdf(id,codigo){
  const response=await fetch(`/api/workflow/rastreio/transferencias/${id}/pdf`);
  if(!response.ok)throw new Error((await response.json()).error||'Não foi possível gerar o PDF.');
  const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');
  link.href=url;link.download=`composicao-${codigo||`transferencia-${id}`}.pdf`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export const loadControlRecord=id=>api(`/workflow/rastreio/registros/${id}`);
