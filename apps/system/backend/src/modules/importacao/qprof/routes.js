import { Router } from 'express';
import { qprofBase, importQprof } from './service.js';
import { searchQprof, selectQprof } from './search.js';
import { assert } from '../../../shared/errors.js';
export function qprofRouter(db){
  const router=Router();
  router.get('/',(_req,res)=>res.json(qprofBase(db)));
  router.get('/titulos',(req,res)=>{
    let filters={};
    if(req.query.filters){try{filters=JSON.parse(req.query.filters);}catch{assert(false,'Filtros inválidos.');}}
    res.json(searchQprof(db,{q:req.query.q,filters,page:req.query.page}));
  });
  router.post('/titulos/selecao',(req,res)=>res.json(selectQprof(db,req.body)));
  router.post('/',async(req,res)=>res.json(await importQprof(db,req.body)));
  return router;
}
