import { authenticatedFetch } from './helpers/auth.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qprofFile,multiSheetFile } from './helpers/import-fixtures.js';
import * as XLSX from 'xlsx';
import { openDatabase, migrate } from '../apps/system/backend/src/infrastructure/database/connection.js';
import { createApp } from '../apps/system/backend/src/app.js';
import { seed } from '../database/seed.js';
import { parseQprof } from '../apps/system/backend/src/modules/importacao/qprof/parser.js';
import { importQprof, replaceQprof, qprofBase } from '../apps/system/backend/src/modules/importacao/qprof/service.js';
import { searchQprof } from '../apps/system/backend/src/modules/importacao/qprof/search.js';
import { confirmTransfer, updateTransfer, rastreioData } from '../apps/system/backend/src/modules/workflow/rastreio/service.js';
const file=qprofFile();
const sample=parseQprof(file);
function fixture(t){const db=openDatabase(':memory:');migrate(db);seed(db);t.after(()=>db.close());return db;}
const metadata=(db,filename='titulos.xlsx')=>({filename,versao:qprofBase(db).versao});
function spreadsheet(rows,options={}){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Titulos');Object.assign(wb,options);return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});}
const headers=['Cedente','Sacado','S. Núm.','Vlr. Pago','Dta. Liq.','Carteira','Cart.Interna'];

test('planilha simulada tem aba única sem X/ID_rec e importa somente os sete campos corretos',()=>{
  const book=XLSX.read(file,{type:'buffer'});assert.equal(book.SheetNames.length,1);
  const sheet=book.Sheets.Titulos;
  assert.equal(sheet.F1.v,'Carteira');assert.equal(sheet.G1.v,'Cart. Interna');
  assert.ok(!XLSX.utils.sheet_to_json(sheet,{header:1})[0].includes('ID_rec'));
  assert.equal(sample.length,40);assert.equal(sample.reduce((sum,r)=>sum+r.valor,0),591456);
  assert.deepEqual(sample[0],{numero:'FIC-0001',cedente:'Empresa Exemplo',sacado:'Cliente Exemplo 1',valor:123456,data_liquidacao:'2026-09-10',carteira:'CARTEIRA-DEMO',carteira_interna:'TÍTULOS FATURIZADOS'});
  assert.equal(new Set(sample.map(r=>r.numero)).size,39,'número de título pode se repetir');
});
test('parser reconhece cabeçalhos, preserva zeros e interpreta datas/valores sem depender da formatação americana',()=>{
  const rows=parseQprof(spreadsheet([headers,['Árvore','João','000123','R$ 1.234,56','18/09/2026','001','Faturizados'],['','','000123',78.18,46275,'','']]));
  assert.equal(rows[0].numero,'000123');assert.equal(rows[0].valor,123456);assert.equal(rows[0].data_liquidacao,'2026-09-18');assert.equal(rows[1].data_liquidacao,'2026-09-10');assert.equal(rows[1].valor,7818);
  const early=parseQprof(spreadsheet([headers,['','','01',1,1,'','']],{Workbook:{WBProps:{date1904:true}}}));assert.equal(early[0].data_liquidacao,'1904-01-02');
});
test('planilha incompleta ou inválida é rejeitada inteira com identificação da linha',()=>{
  for(const rows of [[headers],[headers,['','','',1,'18/09/2026','','']],[headers,['','','1',-1,'18/09/2026','','']],[headers,['','','1',1,'31/09/2026','','']],[headers,['','','1',1.001,'18/09/2026','','']],[headers.slice(0,-1),['','','1',1,'18/09/2026','']]])assert.throws(()=>parseQprof(spreadsheet(rows)));
  const errorBook=XLSX.read(spreadsheet([headers,['','','001',1,'18/09/2026','','']]),{type:'buffer'});errorBook.Sheets.Titulos.D2={t:'e',v:15};
  assert.throws(()=>parseQprof(XLSX.write(errorBook,{type:'buffer',bookType:'xlsx'})),/Linha 2.*erro/);
  assert.throws(()=>parseQprof(multiSheetFile()),/única aba/);
});
test('atualização da base ativa preserva Extrato, Saldos e IDs e distingue cedentes',t=>{
  const db=fixture(t),entries=db.prepare('SELECT * FROM workflow_extrato').all(),balances=db.prepare('SELECT * FROM workflow_saldos').all();
  replaceQprof(db,sample,metadata(db));const firstIds=db.prepare('SELECT id FROM importacao_qprof_titulos WHERE ativo=1 ORDER BY id').all().map(r=>r.id);
  assert.equal(qprofBase(db).quantidade,40);assert.equal(qprofBase(db).versao,1);
  replaceQprof(db,sample.slice(0,2),metadata(db));assert.equal(qprofBase(db).quantidade,2);
  assert.deepEqual(db.prepare('SELECT id FROM importacao_qprof_titulos WHERE ativo=1 ORDER BY id').all().map(r=>r.id),firstIds.slice(0,2));
  assert.deepEqual(db.prepare('SELECT * FROM workflow_extrato').all(),entries);assert.deepEqual(db.prepare('SELECT * FROM workflow_saldos').all(),balances);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('salvar vínculo captura sete campos; substituir base preserva snapshot, edição e proteção de rascunhos antigos',t=>{
  const db=fixture(t);replaceQprof(db,[{...sample[0],valor:1894000}],metadata(db));
  const source=db.prepare('SELECT * FROM importacao_qprof_titulos WHERE ativo=1').get();
  const saved=confirmTransfer(db,{extrato_id:3,itens:[{qprof_titulo_id:source.id}]});
  for(const key of ['data_liquidacao','carteira','carteira_interna'])assert.equal(saved.itens[0][key],source[key]);
  replaceQprof(db,sample,metadata(db));
  const after=db.prepare('SELECT * FROM workflow_rastreio_itens WHERE transferencia_id=?').get(saved.id);
  assert.equal(after.qprof_titulo_id,source.id);assert.equal(after.carteira,source.carteira);assert.equal(after.valor,1894000);
  assert.throws(()=>updateTransfer(db,saved.id,{versao:saved.versao,itens:[]}),/mudou/);
  assert.equal(db.prepare('SELECT id FROM importacao_qprof_titulos WHERE id=?').get(source.id).id,source.id);
  const edited=updateTransfer(db,saved.id,{versao:saved.versao+1,itens:[{id:after.id,tipo:'parcial',titulo:after.titulo,cedente:'Editado',sacado:after.sacado,valor_reais:'18940.00'}]});
  assert.equal(edited.itens[0].carteira_interna,source.carteira_interna);assert.equal(edited.itens[0].data_liquidacao,source.data_liquidacao);
});
test('falha de gravação reverte base, índice de busca, metadados e vínculos',t=>{
  const db=fixture(t),before=db.prepare('SELECT * FROM importacao_qprof_titulos').all(),items=db.prepare('SELECT * FROM workflow_rastreio_itens').all(),meta=qprofBase(db);
  db.exec("CREATE TRIGGER falha_qprof BEFORE INSERT ON importacao_qprof_titulos WHEN new.numero='FALHA' BEGIN SELECT RAISE(ABORT,'falha simulada'); END");
  assert.throws(()=>replaceQprof(db,[sample[0],{...sample[1],numero:'FALHA'}],metadata(db)),/falha simulada/);
  assert.deepEqual(db.prepare('SELECT * FROM importacao_qprof_titulos').all(),before);assert.deepEqual(db.prepare('SELECT * FROM workflow_rastreio_itens').all(),items);assert.deepEqual(qprofBase(db),meta);
  assert.equal(searchQprof(db,{q:'128817001'}).total,1);
});
test('consulta exige critérios e combina data de liquidação, carteiras, texto e valor com paginação no servidor',t=>{
  const db=fixture(t);replaceQprof(db,sample,metadata(db));
  assert.deepEqual(searchQprof(db).items,[]);assert.equal(searchQprof(db).requiresFilter,true);assert.equal('titulos' in rastreioData(db),false);
  const filters={data_liquidacao:{from:'2026-09-10',to:'2026-09-11'},carteira:'CARTEIRA-DEMO',carteira_interna:'TÍTULOS FATURIZADOS'};
  assert.equal(searchQprof(db,{filters:{carteira:'CARTEIRA'}}).total,0,'seletores usam correspondência exata');
  assert.deepEqual(new Set(rastreioData(db).filtros_qprof.carteira),new Set(sample.map(row=>row.carteira).filter(Boolean)));
  const expected=sample.filter(r=>r.data_liquidacao>='2026-09-10'&&r.data_liquidacao<='2026-09-11'&&r.carteira===filters.carteira&&r.carteira_interna==='TÍTULOS FATURIZADOS');
  const first=searchQprof(db,{filters}),second=searchQprof(db,{filters,page:2});
  assert.equal(first.total,expected.length);assert.equal(first.items.length,15);assert.ok(first.pages>1);assert.ok(second.items.every(row=>!first.items.some(one=>one.id===row.id)));
  assert.equal(searchQprof(db,{q:'FIC-0001',filters}).items[0].numero,'FIC-0001');
  assert.ok(searchQprof(db,{q:'titulos faturiz'}).total>0);
  assert.equal(searchQprof(db,{filters:{valor:'1234.56',titulo:'0001'}}).items[0].numero,'FIC-0001');
  assert.ok(searchQprof(db,{q:'1.234,56'}).items.some(row=>row.numero==='FIC-0001'));
  assert.equal(searchQprof(db,{q:'" OR *'}).total,0);
  for(const params of [{filters:{constructor:'123'}},{filters:{documento:'123'}},{filters:{data_liquidacao:{from:'2026-09-31'}}},{filters:{data_liquidacao:{from:'2026-09-20',to:'2026-09-01'}}},{page:-1}])assert.throws(()=>searchQprof(db,params));
});
test('base extensa entrega apenas 15 linhas por consulta e nenhuma linha ao abrir Rastreio',t=>{
  const db=fixture(t),rows=Array.from({length:20000},(_,i)=>({...sample[0],numero:`TESTE-${i}`,data_liquidacao:i%2?'2026-09-10':'2026-09-11'}));
  replaceQprof(db,rows,metadata(db));
  assert.equal(searchQprof(db,{q:'TESTE'}).total,20000);assert.equal(searchQprof(db,{q:'TESTE'}).items.length,15);
  const last=searchQprof(db,{filters:{data_liquidacao:'2026-09-10'},page:9999});assert.equal(last.total,10000);assert.equal(last.page,667);assert.equal(last.items.length,10);
  assert.equal(rastreioData(db).base_qprof.quantidade,20000);assert.ok(JSON.stringify(rastreioData(db)).length<30000);
});
test('importação em worker valida arquivo antes de substituir e impede atualizações concorrentes',async t=>{
  const db=fixture(t),payload={filename:'titulos.xlsx',content:file.toString('base64'),versao:0};
  const results=await Promise.allSettled([importQprof(db,payload),importQprof(db,payload)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
  const before=db.prepare('SELECT * FROM importacao_qprof_titulos').all();
  await assert.rejects(importQprof(db,{...payload,versao:1,content:spreadsheet([headers,['','','1',1,'inválida','','']]).toString('base64')}),/Linha 2/);
  await assert.rejects(importQprof(db,{...payload,versao:1,content:'???'}));
  assert.deepEqual(db.prepare('SELECT * FROM importacao_qprof_titulos').all(),before);assert.equal(qprofBase(db).versao,1);
});
test('API de importação, busca e Rastreio mantém base isolada e respostas limitadas',async t=>{
  const db=fixture(t),server=createApp(db).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/api`;
  const fetch=await authenticatedFetch(db,url);
  const response=await fetch(`${url}/importacao/qprof`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:'titulos.xlsx',content:file.toString('base64'),versao:0})});
  assert.equal(response.status,200);assert.equal((await response.json()).quantidade,40);
  const search=await fetch(`${url}/importacao/qprof/titulos?${new URLSearchParams({filters:JSON.stringify({data_liquidacao:{from:'2026-09-01'}})})}`).then(r=>r.json());assert.equal(search.total,40);assert.equal(search.items.length,15);
  const empty=await fetch(`${url}/importacao/qprof/titulos`).then(r=>r.json());assert.equal(empty.requiresFilter,true);
  const workflow=await fetch(`${url}/workflow/rastreio`).then(r=>r.json());assert.equal('titulos' in workflow,false);
  assert.equal((await fetch(`${url}/importacao/qprof/titulos?filters=invalid`)).status,400);
});
