import { runtimeConfig } from './infrastructure/http/config.js';
import { openDatabase, migrate } from './infrastructure/database/connection.js';
import { createApp } from './app.js';
runtimeConfig();
const db=openDatabase();
migrate(db);
const host=process.env.HOST || '127.0.0.1',port=Number(process.env.PORT || 4310);
const server=createApp(db).listen(port,host,error=>{if(!error)console.log(`All Credit disponível em http://${host}:${port}`);});
server.on('error',error=>{console.error(error.message);db.close();process.exitCode=1;});
let closing=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
  if(closing)return;closing=true;
  const deadline=setTimeout(()=>{server.closeAllConnections();db.close();process.exit(1);},25000);deadline.unref();
  server.close(()=>{clearTimeout(deadline);db.close();process.exit(0);});
});
