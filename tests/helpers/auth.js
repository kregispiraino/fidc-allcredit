import { saveAccess } from '../../apps/system/backend/src/modules/gerenciador/acessos/service.js';
export const testCredentials={login:'teste_operador',senha:'teste123'};
export function seedTestAccess(db){
  if(!db.prepare('SELECT id FROM gerenciador_acessos WHERE login=?').get(testCredentials.login))saveAccess(db,null,{...testCredentials,acesso:'operador'});
}
export async function authenticatedFetch(db,url){
  seedTestAccess(db);
  const response=await globalThis.fetch(`${new URL(url).origin}/api/sistema/sessao/entrar`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(testCredentials)});
  if(!response.ok)throw new Error('Falha na autenticação do teste');
  const cookie=response.headers.get('set-cookie').split(';')[0];
  return (path,options={})=>globalThis.fetch(path,{...options,headers:{...options.headers,Cookie:cookie}});
}
