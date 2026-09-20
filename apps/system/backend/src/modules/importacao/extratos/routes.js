import { Router } from 'express';
import { assert } from '../../../shared/errors.js';
import { importSources } from './sources.js';
import { importStatement } from './service.js';
export function importExtratosRouter(db) {
  const router=Router();
  router.get('/',(_req,res)=>res.json({fontes:importSources(db)}));
  router.post('/:source',(req,res)=>{
    const body=req.body;
    assert(body&&typeof body==='object'&&!Array.isArray(body),'Envie um objeto JSON válido.');
    assert(typeof body.content==='string'&&body.content.length>0&&body.content.length<=11200000&&body.content.length%4===0&&!/[^A-Za-z0-9+/=]/.test(body.content),'Arquivo inválido.');
    assert(Buffer.from(body.content,'base64').toString('base64')===body.content,'Codificação de arquivo inválida.');
    res.json(importStatement(db,req.params.source,{filename:body.filename,buffer:Buffer.from(body.content,'base64'),start:body.start,end:body.end}));
  });
  return router;
}
