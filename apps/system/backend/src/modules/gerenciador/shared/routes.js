import { Router } from 'express';
import { listRegistrations, saveRegistration, saveRegistrations, deleteRegistration } from './service.js';
import { positiveId } from '../../../shared/errors.js';

// Shared CRUD for the three explicitly registered pages. No arbitrary table/route names.
export function registrationRouter(db,kind) {
  const router=Router();
  router.get('/',(_req,res)=>res.json({[kind]:listRegistrations(db,kind)}));
  router.post('/',(req,res)=>res.status(201).json(saveRegistration(db,kind,null,req.body)));
  router.put('/batch',(req,res)=>res.json(saveRegistrations(db,kind,req.body.items)));
  router.put('/:id',(req,res)=>res.json(saveRegistration(db,kind,positiveId(req.params.id),req.body)));
  router.delete('/:id',(req,res)=>res.json(deleteRegistration(db,kind,req.params.id)));
  return router;
}
