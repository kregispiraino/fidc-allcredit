import { Router } from 'express';
import { listSaldos, saveSaldos } from './service.js';
export function saldosRouter(db) {
  const router=Router();
  router.get('/',(_req,res)=>res.json({saldos:listSaldos(db)}));
  router.put('/batch',(req,res)=>res.json(saveSaldos(db,req.body.items)));
  return router;
}
