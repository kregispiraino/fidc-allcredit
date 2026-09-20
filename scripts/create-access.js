import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { openDatabase,migrate } from '../apps/system/backend/src/infrastructure/database/connection.js';
import { saveAccess } from '../apps/system/backend/src/modules/gerenciador/acessos/service.js';
let db;
try{
  let input;
  if(process.stdin.isTTY){
    let hidden=false;
    const output=new Writable({write(chunk,_encoding,callback){if(!hidden)process.stdout.write(chunk);callback();}});
    const rl=createInterface({input:process.stdin,output,terminal:true});
    try{
      const login=await rl.question('Login do operador: ');
      process.stdout.write('Senha (não será exibida): ');hidden=true;
      const senha=await rl.question('');hidden=false;process.stdout.write('\n');input={login,senha,acesso:'operador'};
    }finally{rl.close();}
  }else{
    let value='';for await(const chunk of process.stdin){value+=chunk;if(value.length>4096)throw new Error('Entrada muito longa.');}
    input={...JSON.parse(value),acesso:'operador'};
  }
  db=openDatabase();migrate(db);
  const user=saveAccess(db,null,input);console.log(`Operador ${user.login} criado.`);
}catch(error){console.error(error.code?.startsWith('ERR_SQLITE')?'Não foi possível criar o acesso; confira se o login já existe.':error.message);process.exitCode=1;}
finally{db?.close();}
