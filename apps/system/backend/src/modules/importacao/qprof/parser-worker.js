import { parentPort, workerData } from 'node:worker_threads';
import { parseQprof } from './parser.js';
try{parentPort.postMessage({rows:parseQprof(workerData.buffer,{filename:workerData.filename})});}catch(error){parentPort.postMessage({error:error.message,status:error.status||400});}
