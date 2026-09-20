import { Router } from 'express';
import { assert } from '../../../shared/errors.js';
import { readSession,sessionData,signIn,switchAccount,signOut } from './service.js';
export function sessaoRouter(db){
  const router=Router(),attempts=new Map();
  router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  router.get('/',(req,res)=>res.json(sessionData(db,readSession(db,req))));
  router.post('/entrar',(req,res)=>{
    const now=Date.now();for(const [key,value] of attempts)if(value.until<=now)attempts.delete(key);
    const key=req.ip,entry=attempts.get(key)||{count:0,until:now+15*60*1000};
    assert(entry.count<20,'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',429);
    try{const data=signIn(db,req,res,req.body);attempts.delete(key);res.json(data);}
    catch(error){entry.count++;attempts.set(key,entry);throw error;}
  });
  router.post('/trocar',(req,res)=>res.json(switchAccount(db,readSession(db,req),req.body.acesso_id)));
  router.post('/sair',(req,res)=>res.json(signOut(db,req,res,req.body.todas===true)));
  return router;
}
