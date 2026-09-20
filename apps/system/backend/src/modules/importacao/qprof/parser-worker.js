import { parentPort, workerData } from 'node:worker_threads';
import { parseQprof } from './parser.js';
try{parentPort.postMessage({rows:parseQprof(workerData)});}catch(error){parentPort.postMessage({error:error.message,status:error.status||400});}
