import { runtimeConfig,securityHeaders } from './infrastructure/http/config.js';
import express from 'express';
import { resolve } from 'node:path';
import { projectRoot } from './infrastructure/database/connection.js';
import { apiRouter } from './api/routes.js';
import { sessaoRouter } from './modules/sistema/sessao/routes.js';
import { authorize } from './modules/sistema/sessao/service.js';

export function createApp(db,{env=process.env}={}) {
  const app=express(),config=runtimeConfig(env);
  app.set('trust proxy',config.trustProxy);app.locals.production=config.production;
  app.disable('x-powered-by');
  app.use(securityHeaders(config));
  app.get('/healthz',(_req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{db.prepare('SELECT 1').get();res.json({status:'ok'});}catch{res.status(503).json({status:'unavailable'});}
  });
  app.use('/api/importacao/qprof',express.json({limit:'35mb'}));
  app.use('/api/importacao/extratos',express.json({limit:'12mb'}));
  app.use('/api/workflow/extrato/importar',express.json({limit:'12mb'}));
  app.use(express.json({limit:'2mb'}));
  app.use('/api',(req,res,next)=>{
    if(['POST','PUT','PATCH'].includes(req.method) && (!req.body || typeof req.body!=='object' || Array.isArray(req.body))) return res.status(400).json({error:'Envie um objeto JSON válido.'});
    next();
  });
  app.use('/api/sistema/sessao',sessaoRouter(db));
  app.use('/api',authorize(db),apiRouter(db));
  app.use('/api',(_req,res)=>res.status(404).json({error:'Endpoint não encontrado.'}));
  app.use(express.static(resolve(projectRoot,'apps/system/frontend')));
  app.use((error,_req,res,_next)=>{
    let status=error.status || 500, message=error.message;
    if(/UNIQUE constraint/.test(message)) {status=409;message='Já existe um cadastro com este nome ou vínculo.';}
    else if(/FOREIGN KEY constraint/.test(message)) {status=409;message='Este cadastro está em uso e não pode ser excluído. Você pode inativá-lo.';}
    else if(error.code?.startsWith('ERR_SQLITE')) {status=409;message='A operação violaria a integridade dos dados.';}
    if(status>=500) {console.error(error);message='Não foi possível concluir a operação. Tente novamente.';}
    res.status(status).json({error:message});
  });
  return app;
}
