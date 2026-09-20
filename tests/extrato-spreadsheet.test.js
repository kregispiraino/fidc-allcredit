import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {openDatabase,migrate} from '../apps/system/backend/src/infrastructure/database/connection.js';
import {seed} from '../database/seed.js';
import {exportExtrato,previewExtratoImport,importExtratoSpreadsheet} from '../apps/system/backend/src/modules/workflow/extrato/spreadsheet.js';
import {selectQprof} from '../apps/system/backend/src/modules/importacao/qprof/search.js';
import {replaceQprof} from '../apps/system/backend/src/modules/importacao/qprof/service.js';
import {parseLocalizedNumber} from '../apps/system/frontend/src/components/forms/input-semantics.js';
import {filterTableRows} from '../apps/system/frontend/src/components/tables/table-filter.js';
import {toggleTableSelection} from '../apps/system/frontend/src/components/tables/table-selection.js';
const fixture=t=>{const db=openDatabase(':memory:');migrate(db);seed(db);t.after(()=>db.close());return db;};
function payload(buffer,edit=()=>{}){const book=XLSX.read(buffer,{type:'buffer'});edit(book.Sheets.Extrato,book);return {filename:'extrato.xlsx',content:XLSX.write(book,{type:'buffer',bookType:'xlsx'}).toString('base64')};}
test('Excel preserva ID e valores numéricos, importa alterações atomicamente e mantém rastreios',t=>{
 const db=fixture(t),oldItems=db.prepare('SELECT * FROM workflow_rastreio_itens').all(),count=db.prepare('SELECT count(*) n FROM workflow_extrato').get().n;
 const data=payload(exportExtrato(db,[20,21]),sheet=>{for(let r=2;r<=3;r++){sheet[`F${r}`]={t:'s',v:'Histórico atualizado no Excel'};sheet[`G${r}`]={t:'n',v:sheet[`A${r}`].v===20?15001:-15001};sheet[`D${r}`]={t:'s',v:'QI Tech'};}});
 const preview=previewExtratoImport(db,data);assert.equal(preview.atualizar,2);assert.equal(db.prepare('SELECT historico FROM workflow_extrato WHERE id=20').get().historico,'CRÉDITO · COMPOSIÇÃO CONCLUÍDA');
 const result=importExtratoSpreadsheet(db,{...data,revisoes:preview.revisoes});assert.equal(result.atualizados,2);assert.equal(db.prepare('SELECT count(*) n FROM workflow_extrato').get().n,count);
 assert.equal(db.prepare('SELECT valor FROM workflow_extrato WHERE id=21').get().valor,-1500100);assert.equal(db.prepare('SELECT entidade_id FROM workflow_extrato WHERE id=20').get().entidade_id,3);
 assert.deepEqual(db.prepare('SELECT * FROM workflow_rastreio_itens').all(),oldItems);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 const unchanged=payload(exportExtrato(db,[20,21]));const check=previewExtratoImport(db,unchanged);assert.equal(check.atualizar,0);assert.equal(importExtratoSpreadsheet(db,{...unchanged,revisoes:check.revisoes}).sem_alteracao,2);
});
test('IDs inexistentes, repetidos, valores e cadastros inválidos rejeitam a planilha inteira',t=>{
 const db=fixture(t),original=db.prepare('SELECT * FROM workflow_extrato').all(),file=exportExtrato(db,[1,2]);
 for(const edit of [s=>s.A3={t:'n',v:999999},s=>s.A3={...s.A2},s=>s.G3={t:'s',v:'inválido'},s=>s.H3={t:'s',v:'Conta desconhecida'},s=>s.C3={t:'s',v:'31/09/2026'},s=>s.A3={t:'s',v:''},s=>s.G3={t:'n',v:5,f:'1+4'}]){
  const data=payload(file,(s)=>{s.F2={t:'s',v:'não deve gravar'};edit(s);});assert.throws(()=>previewExtratoImport(db,data));assert.deepEqual(db.prepare('SELECT * FROM workflow_extrato').all(),original);
 }
});
test('planilha antiga e mudança após conferência são detectadas; erro durante gravação reverte todas as linhas',t=>{
 const db=fixture(t),file=exportExtrato(db,[1,2]),data=payload(file,s=>{s.F2={t:'s',v:'primeiro'};s.F3={t:'s',v:'FALHA'};});
 const preview=previewExtratoImport(db,data);db.exec("CREATE TRIGGER test_import_error BEFORE UPDATE ON workflow_extrato WHEN new.historico='FALHA' BEGIN SELECT RAISE(ABORT,'falha simulada'); END");
 const before=db.prepare('SELECT * FROM workflow_extrato').all();assert.throws(()=>importExtratoSpreadsheet(db,{...data,revisoes:preview.revisoes}),/falha simulada/);assert.deepEqual(db.prepare('SELECT * FROM workflow_extrato').all(),before);
 db.exec("DROP TRIGGER test_import_error; UPDATE workflow_extrato SET historico='Alterado depois' WHERE id=1");assert.throws(()=>previewExtratoImport(db,data),/mudou desde a exportação/);
 const withoutRevision=payload(file,s=>{delete s.I1;delete s.I2;delete s.I3;s.F2={t:'s',v:'Alteração nova'};});const checked=previewExtratoImport(db,withoutRevision);
 db.exec("UPDATE workflow_extrato SET historico='Concorrente' WHERE id=2");assert.throws(()=>importExtratoSpreadsheet(db,{...withoutRevision,revisoes:checked.revisoes}),/mudou após/);
});
test('CSV anterior com campos técnicos continua atualizando pelo ID e suporta débito em reais',t=>{
 const db=fixture(t),text='id;status;data;entidade_id;natureza_id;historico;valor;conta_id\n11;pending;18/09/2026;;;CSV editado;-R$ 1.234,56;3';
 const data={filename:'extrato.csv',content:Buffer.from(text).toString('base64')},check=previewExtratoImport(db,data);
 assert.equal(importExtratoSpreadsheet(db,{...data,revisoes:check.revisoes}).atualizados,1);assert.equal(db.prepare('SELECT valor FROM workflow_extrato WHERE id=11').get().valor,-123456);
});
test('seleção de títulos atravessa páginas, exige filtro e rejeita versão antiga e mais de 2.000 resultados',t=>{
 const db=fixture(t),rows=Array.from({length:2100},(_,i)=>({numero:`T${i}`,cedente:'A',sacado:'B',valor:100,carteira:i<40?'Menor':'Maior',carteira_interna:'Teste',data_liquidacao:'2026-09-18'}));
 replaceQprof(db,rows,{filename:'teste.xlsx',versao:0});assert.equal(selectQprof(db,{filters:{carteira:'Menor'},versao:1}).items.length,40);
 assert.equal(selectQprof(db,{versao:1}).items.length,0);assert.throws(()=>selectQprof(db,{q:'T',versao:1}),/2.000/);assert.throws(()=>selectQprof(db,{filters:{carteira:'Menor'},versao:0}),/mudou/);
});
test('moeda brasileira, sinal e colagem convertem em reais e o filtro compara centavos',()=>{
 for(const [text,expected] of [['1.000','1000'],['1.234,56','1234.56'],['-R$ 6,35','-6.35'],['R$ -1.234,56','-1234.56'],['1234.56','1234.56'],['0,00','0.00']]){
  assert.equal(parseLocalizedNumber(text,'money'),expected);assert.equal(filterTableRows([{valor:expected}],[{key:'valor',type:'number',format:'money'}],{valor:parseLocalizedNumber(text,'money')}).length,1);
 }
 assert.equal(parseLocalizedNumber('1,234','money'),null);assert.equal(parseLocalizedNumber('abc','money'),null);
 const selected=new Set(['1']);toggleTableSelection(selected,[{id:1},{id:2},{id:3}]);assert.deepEqual([...selected],['1','2','3']);toggleTableSelection(selected,[{id:1},{id:2}]);assert.deepEqual([...selected],['3']);
});
