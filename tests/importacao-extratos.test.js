import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase,migrate,transaction } from '../apps/system/backend/src/infrastructure/database/connection.js';
import { ensureImportAccounts,sourceByKey } from '../apps/system/backend/src/modules/importacao/extratos/sources.js';
import { importStatement,parseStatement } from '../apps/system/backend/src/modules/importacao/extratos/service.js';
import { saveExtratoRows,deleteExtratoRow } from '../apps/system/backend/src/modules/workflow/extrato/service.js';
import { defaultImportPeriod } from '../apps/system/frontend/src/features/importacao/shared/period.js';
import { singulareFile,bradescoFile } from './helpers/import-fixtures.js';
import { authenticatedFetch } from './helpers/auth.js';
import { createApp } from '../apps/system/backend/src/app.js';
const sources=[['bradesco-57420-1',bradescoFile],['singulare-89727720',singulareFile],['singulare-59697697',()=>singulareFile('59697697')]];
function fixture(t){const db=openDatabase(':memory:');migrate(db);transaction(db,()=>ensureImportAccounts(db));t.after(()=>db.close());return db;}
const range={start:'2026-09-17',end:'2026-09-18'};
for(const [key,file] of sources)test(`importação sintética ${key}: saldos não viram movimentos; fechamento e duplicidade`,t=>{
  const db=fixture(t),account=sourceByKey(db,key);
  saveExtratoRows(db,[{data:'2026-09-16',historico:'Saldo anterior de teste',valor_reais:'10.00',conta_id:account.conta_id}]);
  const result=importStatement(db,key,{...file(),...range});assert.equal(result.criados,2);assert.equal(result.saldo_final_automatico,true);
  const balance=db.prepare('SELECT * FROM workflow_saldos WHERE conta_id=?').get(account.conta_id);
  assert.equal(balance.saldo_sistema,2900);assert.equal(balance.saldo_banco,2900);assert.equal(balance.saldo_final,2900);
  assert.equal(balance.updated_at,key.startsWith('bradesco')?'2026-09-18':'2026-09-18 19:17:39');
  assert.equal(importStatement(db,key,{...file(),...range}).duplicados,2);
  assert.equal(db.prepare('SELECT count(*) n FROM workflow_extrato').get().n,3);
  const entry=db.prepare('SELECT extrato_id FROM importacao_extratos_registros LIMIT 1').get();deleteExtratoRow(db,entry.extrato_id);
  assert.equal(importStatement(db,key,{...file(),...range}).criados,0,'exclusão manual não permite ressuscitar registro importado');
});
test('período é inclusivo, conta errada/saldo inválido não gravam e rollback preserva o saldo',t=>{
  const db=fixture(t),key=sources[1][0],file=singulareFile();
  assert.throws(()=>importStatement(db,sources[2][0],{...file,...range}),/outra conta/);
  assert.throws(()=>importStatement(db,key,{...file,buffer:Buffer.from(file.buffer.toString().replace('00:00:00;29,00','00:00:00;99,00')),...range}),/diverge/);
  db.exec("CREATE TRIGGER import_failure BEFORE INSERT ON importacao_extratos_registros WHEN NEW.documento='2' BEGIN SELECT RAISE(ABORT,'falha simulada'); END");
  assert.throws(()=>importStatement(db,key,{...file,...range}),/falha simulada/);assert.equal(db.prepare('SELECT count(*) n FROM workflow_extrato').get().n,0);
  db.exec('DROP TRIGGER import_failure');
  const result=importStatement(db,key,{...file,start:'2026-09-18',end:'2026-09-18'});assert.equal(result.criados,1);assert.equal(result.fora_periodo,1);
});
test('saldos, formatos, horários e registros repetidos são validados',()=>{
  const file=singulareFile();const source={banco:'singulare',numero:'89727720'};
  const parsed=parseStatement(source,file.buffer,file.filename);assert.equal(parsed.entries.length,2);assert.equal(parsed.snapshots.at(-1).at,'2026-09-18 16:17:39');
  assert.throws(()=>parseStatement(source,file.buffer,'incorreto.csv'));
  assert.throws(()=>parseStatement(source,Buffer.from(file.buffer.toString().replace('R$ 29,00','R$ 99,00')),file.filename));
  const text='Data;Tipo do lançamento;Historico;Documento;Credito;Debito;Saldo\n;SALDO DISPONIVEL;SALDO DISPONIVEL;0;;;R$ 10,00\n18/09/2026 16:17:39;TARIFA;MOVIMENTAÇÃO;1;;R$ 1,00;\n18/09/2026 16:17:39;TARIFA;MOVIMENTAÇÃO;2;;R$ 1,00;\n;SALDO DISPONIVEL;SALDO DISPONIVEL;0;;;R$ 8,00';
  assert.equal(parseStatement(source,Buffer.from(text),file.filename).entries.length,2);
});
test('período padrão usa o dia útil anterior no fuso de São Paulo',()=>{
  assert.deepEqual(defaultImportPeriod(new Date('2026-09-21T13:00:00Z')),{start:'2026-09-18',end:'2026-09-21'});
});
test('API importa arquivos sintéticos autenticada e evita duplicidade concorrente',async t=>{
  const db=fixture(t),server=createApp(db).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const url=`http://127.0.0.1:${server.address().port}/api/importacao/extratos/${sources[1][0]}`,fetch=await authenticatedFetch(db,url),file=singulareFile();
  const body={filename:file.filename,content:file.buffer.toString('base64'),...range};
  const responses=await Promise.all([1,2].map(()=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})));
  assert.ok(responses.every(r=>r.status===200));assert.deepEqual((await Promise.all(responses.map(r=>r.json()))).map(r=>r.criados).sort(),[0,2]);
});
