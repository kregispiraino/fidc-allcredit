import { DatabaseSync,backup } from 'node:sqlite';
import { mkdirSync,chmodSync,existsSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
const source=resolve(process.env.ALLCREDIT_DB||'database/allcredit.sqlite');
const target=resolve(process.argv[2]||`database/backups/allcredit-${new Date().toISOString().replaceAll(':','-')}.sqlite`);
let db;
try{
  if(source===target||existsSync(target))throw new Error('Informe um destino novo para o backup.');
  mkdirSync(dirname(target),{recursive:true});db=new DatabaseSync(source,{readOnly:true});
  await backup(db,target);chmodSync(target,0o600);console.log(`Backup consistente criado em ${target}`);
}catch(error){console.error(error.message);process.exitCode=1;}finally{db?.close();}
