import { exportExtrato, previewExtratoImport, importExtratoSpreadsheet } from './spreadsheet.js';
import { Router } from 'express';
import { extratoData, classifyExtrato, saveExtratoRows, deleteExtratoRow } from './service.js';
export function extratoRouter(db) {
  const router=Router();
  router.post('/exportar',(req,res)=>{const file=exportExtrato(db,req.body.ids);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('extrato.xlsx').send(file);});
  router.post('/importar/conferir',(req,res)=>res.json(previewExtratoImport(db,req.body)));
  router.post('/importar',(req,res)=>res.json(importExtratoSpreadsheet(db,req.body)));
  router.get('/',(_req,res)=>res.json(extratoData(db)));
  router.patch('/',(req,res)=>res.json(classifyExtrato(db,req.body)));
  router.put('/batch',(req,res)=>res.json(saveExtratoRows(db,req.body.items)));
  router.delete('/:id',(req,res)=>res.json(deleteExtratoRow(db,req.params.id)));
  return router;
}
