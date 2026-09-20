import { Router } from 'express';
import { listAccess,saveAccess,deleteAccess } from './service.js';
export function acessosRouter(db){
  const router=Router();
  router.get('/',(_req,res)=>res.json({acessos:listAccess(db)}));
  router.post('/',(req,res)=>res.status(201).json(saveAccess(db,null,req.body)));
  router.put('/:id',(req,res)=>res.json(saveAccess(db,req.params.id,req.body)));
  router.delete('/:id',(req,res)=>res.json(deleteAccess(db,req.params.id)));
  return router;
}
