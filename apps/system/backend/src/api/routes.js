import { qprofRouter } from '../modules/importacao/qprof/routes.js';
import { importExtratosRouter } from '../modules/importacao/extratos/routes.js';
import { saldosRouter } from '../modules/workflow/saldos/routes.js';
import { Router } from 'express';
import { extratoRouter } from '../modules/workflow/extrato/routes.js';
import { rastreioRouter } from '../modules/workflow/rastreio/routes.js';
import { naturezasRouter } from '../modules/gerenciador/naturezas/routes.js';
import { entidadesRouter } from '../modules/gerenciador/entidades/routes.js';
import { contasRouter } from '../modules/gerenciador/contas/routes.js';
import { acessosRouter } from '../modules/gerenciador/acessos/routes.js';

// Composition root only. HTTP contracts and domain rules belong to section/page modules.
export function apiRouter(db) {
  const router=Router();
  router.get('/health',(_req,res)=>res.json({status:'ok',database:'sqlite'}));
  router.use('/importacao/qprof',qprofRouter(db));
  router.use('/importacao/extratos',importExtratosRouter(db));
  router.use('/workflow/saldos',saldosRouter(db));
  router.use('/workflow/extrato',extratoRouter(db));
  router.use('/workflow/rastreio',rastreioRouter(db));
  router.use('/gerenciador/naturezas',naturezasRouter(db));
  router.use('/gerenciador/entidades',entidadesRouter(db));
  router.use('/gerenciador/contas',contasRouter(db));
  router.use('/gerenciador/acessos',acessosRouter(db));
  return router;
}
