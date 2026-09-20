import { controlDetails } from './registros.js';
import { compositionPdf } from './pdf.js';
import { Router } from 'express';
import { rastreioData, confirmTransfer, updateTransfer, transferDetails, associateTransfer } from './service.js';
export function rastreioRouter(db) {
  const router=Router();
  router.get('/registros/:id', (req,res)=>res.json(controlDetails(db,req.params.id)));
  router.get('/',(_req,res)=>res.json(rastreioData(db)));
  router.post('/transferencias',(req,res)=>res.status(201).json(confirmTransfer(db,req.body)));
  router.put('/transferencias/:id',(req,res)=>res.json(updateTransfer(db,req.params.id,req.body)));
  router.patch('/transferencias/:id/movimentacao',(req,res)=>res.json(associateTransfer(db,req.params.id,req.body)));
  router.get('/transferencias/:id/pdf',async(req,res)=>{
    const buffer=await compositionPdf(db,req.params.id);
    res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="composicao-${transferDetails(db,req.params.id).codigo}.pdf"`,'Cache-Control':'no-store'}).send(buffer);
  });
  router.get('/transferencias/:id',(req,res)=>res.json(transferDetails(db,req.params.id)));
  return router;
}
