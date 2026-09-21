import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase,migrate} from '../apps/system/backend/src/infrastructure/database/connection.js';
import {seed} from '../database/seed.js';
import {controlRecords,controlDetails} from '../apps/system/backend/src/modules/workflow/rastreio/registros.js';
import {confirmTransfer} from '../apps/system/backend/src/modules/workflow/rastreio/service.js';
import {replaceQprof,qprofBase,importQprof} from '../apps/system/backend/src/modules/importacao/qprof/service.js';
import {parseQprof} from '../apps/system/backend/src/modules/importacao/qprof/parser.js';
import {searchQprof} from '../apps/system/backend/src/modules/importacao/qprof/search.js';
function fixture(t){const db=openDatabase(':memory:');migrate(db);seed(db);t.after(()=>db.close());return db;}
function movement(db,valor){return Number(db.prepare("INSERT INTO workflow_extrato(data,historico,valor,conta_id) VALUES('2026-09-21','Teste de identidade',?,2)").run(valor).lastInsertRowid);}
function link(db,valor,item={}){return confirmTransfer(db,{extrato_id:movement(db,valor),itens:[{tipo:'titulo',titulo:'AB-001 / 02',cedente:'Empresa Árvore',valor_reais:(Math.abs(valor)/100).toFixed(2),...item}]});}
const state=db=>controlRecords(db).find(r=>r.titulo==='AB-001 / 02'&&r.cedente==='Empresa Árvore');
const source={numero:'AB-001 / 02',cedente:'Empresa Árvore',sacado:'Cliente',valor:10000,data_liquidacao:'2026-09-21',carteira:'237',carteira_interna:'Faturizados'};
const replace=(db,rows)=>replaceQprof(db,rows,{filename:'teste.csv',versao:qprofBase(db).versao});
test('A/B: somente entrada fica pendente; saída pelo número normalizado reutiliza o registro',t=>{
 const db=fixture(t),entry=link(db,10000);assert.equal(state(db).saldo_calculado,10000);assert.equal(state(db).aguarda_saida,true);
 const exit=link(db,-10000,{titulo:' ab00102 ',cedente:'empresa arvore'});assert.equal(entry.itens[0].registro_id,exit.itens[0].registro_id);assert.equal(state(db).aguarda_saida,false);
});
test('C: reimportações reutilizam IDs inclusive após título sair da base ativa',t=>{
 const db=fixture(t);replace(db,[source]);const id=searchQprof(db,{q:'AB'}).items[0].id;
 const entry=link(db,10000,{qprof_titulo_id:id});replace(db,[{...source,numero:'OUTRO'}]);assert.equal(searchQprof(db,{q:'AB'}).total,0);
 replace(db,[{...source,numero:' ab00102 ',cedente:'empresa arvore'}]);assert.equal(searchQprof(db,{q:'ab00102'}).items[0].id,id);
 const exit=link(db,-10000,{qprof_titulo_id:id});assert.equal(entry.itens[0].registro_id,exit.itens[0].registro_id);assert.equal(state(db).aguarda_saida,false);
 replace(db,[source]);assert.equal(state(db).aguarda_saida,false);
});
test('D/E: saída parcial mantém apenas saldo e duas saídas completas liquidam',t=>{
 const db=fixture(t);link(db,10000);link(db,-7000);assert.equal(state(db).saldo_calculado,3000);assert.equal(state(db).aguarda_saida,true);
 link(db,-3000);assert.equal(state(db).saldo_calculado,0);assert.equal(state(db).aguarda_saida,false);
});
test('F/G: legado não gera pendência e recebimento sem título continua real',t=>{
 const db=fixture(t),entry=link(db,10000);db.prepare("UPDATE workflow_extrato SET rastreio_condicao='legado_sem_rastreio' WHERE id=?").run(entry.extrato_id);assert.equal(state(db).aguarda_saida,false);
 const receipt=link(db,5000,{tipo:'ajuste',titulo:''});db.prepare("UPDATE workflow_rastreio_registros SET status_origem='SEM TÍTULO / EM CONCILIAÇÃO' WHERE id=?").run(receipt.itens[0].registro_id);
 assert.equal(controlRecords(db).find(r=>r.id===receipt.itens[0].registro_id).aguarda_saida,true);
});
test('IDs históricos diferentes são somados sem modificar vínculos; percurso retorna ambos',t=>{
 const db=fixture(t),entry=link(db,5643158,{titulo:'36094'});
 const other=Number(db.prepare("INSERT INTO workflow_rastreio_registros(tipo,titulo,cedente,valor) VALUES('titulo',' 36094 ','EMPRESA ARVORE',5643158)").run().lastInsertRowid);
 const exit=link(db,-5643158,{registro_id:other,titulo:'36094'});
 const before=db.prepare('SELECT * FROM workflow_rastreio_itens').all();const row=controlDetails(db,other);
 assert.equal(row.saldo_calculado,0);assert.equal(row.aguarda_saida,false);assert.equal(row.vinculos.length,2);assert.deepEqual(new Set(row.registro_ids),new Set([other,entry.itens[0].registro_id]));
 assert.deepEqual(db.prepare('SELECT * FROM workflow_rastreio_itens').all(),before);
 db.prepare('DELETE FROM workflow_rastreio_transferencias WHERE id=?').run(exit.id);assert.equal(controlDetails(db,other).aguarda_saida,true);
});
test('números iguais de cedentes distintos não liquidam um ao outro',t=>{
 const db=fixture(t);link(db,10000);link(db,-10000,{cedente:'Outra empresa'});assert.equal(state(db).aguarda_saida,true);
 replace(db,[source,{...source,cedente:'Outra empresa'}]);assert.equal(searchQprof(db,{q:'AB'}).total,2);
});
const csv='Cedente;Sacado;S. Núm.;Vlr. Pago;Dta. Liq.;Carteira;Cart. Interna;Situação\r\n"Árvore; Ltda";"João ""Silva""";000123;"R$ 1.234,56";21/09/2026;001;Faturizados;Baixado\r\nEmpresa;Cliente;OUTRO;0;;001;Faturizados;Aberto\r\n;;;;;;;\r\n';
test('CSV direto trata BOM, UTF-8/1252, delimitador, aspas, zeros, baixados e reimportação',async t=>{
 const db=fixture(t),utf=Buffer.from('\uFEFF'+csv),rows=parseQprof(utf,{filename:'QPROF.csv'});
 assert.equal(rows.length,1);assert.equal(rows[0].numero,'000123');assert.equal(rows[0].valor,123456);assert.equal(rows[0].cedente,'Árvore; Ltda');assert.equal(rows[0].sacado,'João "Silva"');assert.equal(rows[0].data_liquidacao,'2026-09-21');
 assert.deepEqual(parseQprof(Buffer.from(csv,'latin1'),{filename:'QPROF.csv'}),rows);
 assert.deepEqual(parseQprof(Buffer.from('\uFEFF'+csv,'utf16le'),{filename:'QPROF.csv'}),rows);
 for(let i=0;i<2;i++)await importQprof(db,{filename:'QPROF.csv',content:utf.toString('base64'),versao:qprofBase(db).versao});
 assert.equal(db.prepare("SELECT count(*) n FROM importacao_qprof_titulos WHERE numero='000123'").get().n,1);
 assert.throws(()=>parseQprof(Buffer.from(csv+'"aberto'),{filename:'QPROF.csv'}),/aspas/);
 assert.throws(()=>parseQprof(Buffer.from(csv.replace('21/09/2026','31/09/2026')),{filename:'QPROF.csv'}),/Data/);
});
test('CSV aceita vírgula/tab e duplicata idêntica; conflito de baixa reverte importação',t=>{
 const db=fixture(t);for(const delimiter of [',','\t']){const lines=[['Cedente','Sacado','Título','Valor','Data de liquidação','Carteira','Carteira interna'],['Empresa','Cliente','00001','1234.56','2026-09-21','001','Faturizados']];assert.equal(parseQprof(Buffer.from(lines.map(r=>r.join(delimiter)).join('\n')),{filename:'x.csv'})[0].valor,123456);}
 replace(db,[source,source]);assert.equal(qprofBase(db).quantidade,1);const before=qprofBase(db);
 assert.throws(()=>replace(db,[source,{...source,valor:20000}]),/divergentes/);assert.deepEqual(qprofBase(db),before);
});
