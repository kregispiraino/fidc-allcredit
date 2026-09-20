export async function api(path, options={}) {
  const response=await fetch(`/api${path}`,{...options,headers:{'Content-Type':'application/json',...options.headers},body:options.body===undefined?undefined:JSON.stringify(options.body)});
  const data=await response.json();
  if(!response.ok){
    if(response.status===401&&!path.startsWith('/sistema/sessao'))window.dispatchEvent(new Event('session-expired'));
    const error=new Error(data.error || 'Não foi possível concluir a operação.');error.status=response.status;throw error;
  }
  return data;
}
