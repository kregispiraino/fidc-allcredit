import { qprofFile,singulareFile } from './helpers/import-fixtures.js';
import { seedTestAccess,testCredentials } from './helpers/auth.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
import { openDatabase, migrate } from '../apps/system/backend/src/infrastructure/database/connection.js';
import { createApp } from '../apps/system/backend/src/app.js';
import { seed } from '../database/seed.js';
import { confirmTransfer } from '../apps/system/backend/src/modules/workflow/rastreio/service.js';
import { saveExtratoRows } from '../apps/system/backend/src/modules/workflow/extrato/service.js';

let browser;
function browserPath() {
  if(process.env.ALLCREDIT_BROWSER_PATH)return process.env.ALLCREDIT_BROWSER_PATH;
  if(existsSync(chromium.executablePath()))return chromium.executablePath();
  // Reuse an installed local Chromium when the default revision is not downloaded.
  const cache=join(homedir(),'Library/Caches/ms-playwright');
  if(existsSync(cache))for(const folder of readdirSync(cache).filter(n=>n.startsWith('chromium_headless_shell-')).sort().reverse()) {
    for(const arch of ['x64','arm64']) {
      const candidate=join(cache,folder,`chrome-headless-shell-mac-${arch}/chrome-headless-shell`);
      if(existsSync(candidate))return candidate;
    }
  }
  return undefined;
}
before(async()=>{browser=await chromium.launch({headless:true,executablePath:browserPath()});mkdirSync('test-results',{recursive:true});});
after(async()=>{await browser?.close();});
async function fixture(t,viewport={width:1440,height:900}) {
  const db=openDatabase(':memory:');migrate(db);seed(db);seedTestAccess(db);
  const server=createApp(db).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const page=await browser.newPage({viewport}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const url=`http://127.0.0.1:${server.address().port}`;
  page.setDefaultTimeout(6000);
  t.after(async()=>{await page.close();await new Promise(resolve=>server.close(resolve));db.close();assert.deepEqual(errors,[],'Nenhum erro JavaScript no navegador');});
  await page.request.post(`${url}/api/sistema/sessao/entrar`,{data:testCredentials});
  await page.goto(`${url}/#workflow/extrato`);await page.locator('.standard-data-table tbody tr').first().waitFor();
  return {page,db,url};
}
async function choose(page,selector,label) {
  const select=page.locator(selector),trigger=select.locator('..').locator('.standard-select-trigger');
  await trigger.click();await page.locator('.standard-select-menu').getByRole('option',{name:label,exact:true}).click();
}
async function navigate(page,path) {await page.evaluate(path=>location.hash=path,path);await page.waitForTimeout(80);}
const selectedIds=[101,102,103,104,105];
async function sourceTitles(page) {
  await page.locator('.composition-panel [data-table-control="filter"]').click();
  await choose(page,'[data-filter-column]','Data de liquidação');
  await page.getByRole('textbox',{name:'Data para Data de liquidação',exact:true}).fill('01/09/2026');
  await page.getByRole('button',{name:'Aplicar',exact:true}).click();
  await page.locator('[data-title="101"]').waitFor();
}
async function compose(page) {await sourceTitles(page);for(const id of selectedIds)await page.locator(`[data-title="${id}"]`).click();}
async function saveTransfer(page) {
  await page.locator('[data-confirm-transfer]').click();
  await page.getByRole('button',{name:'Confirmar rastreio',exact:true}).click();
  await page.locator('.confirmation-backdrop').waitFor({state:'detached'});
}

test('Extrato apresenta apenas tabela, filtros e paginação, sem faixa operacional',async t=>{
  const {page}=await fixture(t);
  assert.equal(await page.locator('.sheet-tabs,#listingSearch,.results-count').count(),0);
  assert.equal(await page.locator('#topbar button').count(),1);
  assert.equal(await page.locator('[data-table-action="titulos"]').count(),0);
  assert.equal(await page.locator('.operation-topline,.task-overview,#headerTabs .header-tab').count(),0);
  assert.equal(await page.locator('.data-table tbody tr').count(),25);
  await page.getByRole('button',{name:'Próxima página',exact:true}).click();
  assert.equal(await page.locator('.data-table tbody tr').count(),4);
  await page.getByRole('button',{name:'Filtrar tabela',exact:true}).click();
  await choose(page,'[data-filter-value]','Conciliado');
  await page.getByRole('button',{name:'Aplicar',exact:true}).click();
  assert.equal(await page.locator('.data-table tbody tr').count(),3);
  await page.screenshot({path:'test-results/extrato-light.png',fullPage:true});
});
test('cadastro rápido preserva várias linhas, salva, edita inline e exclui',async t=>{
  const {page,db}=await fixture(t);
  await navigate(page,'gerenciador/naturezas');
  assert.equal(await page.locator('#headerTabs .header-tab').count(),0);
  assert.equal(await page.locator('.operation-topline').count(),0);
  assert.equal(await page.locator('#breadcrumbPage').innerText(),'Naturezas');
  await page.screenshot({path:'test-results/gerenciador-naturezas.png',fullPage:true});
  await page.getByRole('button',{name:'Cadastro rápido',exact:true}).click();
  await page.locator('[data-inline-field="nome"][data-record-id="draft"]').fill('Teste operacional');
  await page.locator('[data-inline-field="classificacao"][data-record-id="draft"]').fill('Despesa');
  await page.getByRole('button',{name:'Cadastro rápido',exact:true}).click();
  assert.equal(await page.locator('[data-inline-field="nome"][data-record-id="draft"]').inputValue(),'Teste operacional');
  await page.locator('[data-inline-field="nome"][data-record-id="draft-2"]').fill('Segundo cadastro');
  await page.locator('[data-inline-field="classificacao"][data-record-id="draft-2"]').fill('Entrada');
  assert.equal(db.prepare("SELECT count(*) n FROM gerenciador_naturezas WHERE nome='Teste operacional'").get().n,0);
  await page.getByRole('button',{name:'Salvar',exact:true}).click();
  await page.locator('.standard-data-table[data-table-editing="false"]').waitFor();
  const record=db.prepare("SELECT * FROM gerenciador_naturezas WHERE nome='Teste operacional'").get();assert.ok(record);
  assert.ok(db.prepare("SELECT id FROM gerenciador_naturezas WHERE nome='Segundo cadastro'").get());
  await page.locator(`[data-row-edit="${record.id}"]`).click();
  assert.equal(await page.locator('dialog').count(),0);
  await choose(page,`[data-inline-field="status"][data-record-id="${record.id}"]`,'Inativo');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('.standard-data-table[data-table-editing="false"]').waitFor();
  assert.equal(db.prepare('SELECT status FROM gerenciador_naturezas WHERE id=?').get(record.id).status,'inactive');
  await page.locator(`[data-row-delete="${record.id}"]`).click();await page.locator('[data-confirm-delete]').click();
  await page.locator(`[data-row-delete="${record.id}"]`).waitFor({state:'detached'});
  assert.equal(db.prepare('SELECT id FROM gerenciador_naturezas WHERE id=?').get(record.id),undefined);
});
test('Editar sem seleção abre campos na tabela; salvar e cancelar funcionam',async t=>{
  const {page,db}=await fixture(t);
  await page.locator('[data-table-control="edit"]').click();
  assert.ok(await page.locator('[data-inline-field="entidade_id"]').count()>1);
  await page.locator('[data-inline-field="entidade_id"][data-record-id="30"]').locator('..').locator('.standard-select-trigger').click();
  await page.locator('.standard-select-search input').fill('QI');
  await page.getByRole('option',{name:'QI Tech',exact:true}).click();
  await choose(page,'[data-inline-field="natureza_id"][data-record-id="30"]','Tarifa bancária');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('.standard-data-table[data-table-editing="false"]').waitFor();
  await page.reload();await page.locator('[data-row-edit="30"]').waitFor();
  const entry=db.prepare('SELECT * FROM workflow_extrato WHERE id=30').get();assert.equal(entry.entidade_id,3);assert.equal(entry.natureza_id,3);
  await page.locator('[data-row-edit="30"]').click();
  await choose(page,'[data-inline-field="entidade_id"][data-record-id="30"]','Conta Cobrança');
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal(db.prepare('SELECT entidade_id FROM workflow_extrato WHERE id=30').get().entidade_id,3);
});
test('cadastro rápido de extrato usa data e valor brasileiros, inclusive débito',async t=>{
  const {page,db}=await fixture(t);
  await page.getByRole('button',{name:'Cadastro rápido',exact:true}).click();
  await page.getByRole('textbox',{name:'Data',exact:true}).fill('20/09/2026');
  await page.locator('[data-inline-field="historico"]').fill('DÉBITO MANUAL DE TESTE');
  await page.getByRole('textbox',{name:'Valor (R$)',exact:true}).fill('-1.234,56');
  await choose(page,'[data-inline-field="conta_id"]','Singulare 89727720');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('.standard-data-table[data-table-editing="false"]').waitFor();
  const row=db.prepare("SELECT * FROM workflow_extrato WHERE historico='DÉBITO MANUAL DE TESTE'").get();
  assert.equal(row.valor,-123456);assert.equal(row.data,'2026-09-20');assert.equal(row.status,'pending');
  await navigate(page,'workflow/rastreio/liquidacao');await page.locator(`[data-transfer="${row.id}"]`).waitFor();
});
test('edição em lote Askora e duplicação ficam temporárias até salvar',async t=>{
  const {page,db}=await fixture(t);
  await navigate(page,'gerenciador/naturezas');
  await page.locator('[data-row-select="1"]').click();await page.locator('[data-row-select="2"]').click();
  await page.getByRole('button',{name:'Editar selecionados',exact:true}).click();
  await choose(page,'[data-batch-field]','Classificação');
  await page.getByRole('textbox',{name:'Preencher em lote',exact:true}).fill('Revisado');
  await page.getByRole('button',{name:'Confirmar edição',exact:true}).click();
  await page.locator('.selection-summary').filter({hasText:'Nenhum registro selecionado'}).waitFor();
  assert.equal(db.prepare('SELECT classificacao FROM gerenciador_naturezas WHERE id=1').get().classificacao,'Revisado');
  assert.equal(db.prepare('SELECT classificacao FROM gerenciador_naturezas WHERE id=2').get().classificacao,'Revisado');
  await page.locator('[data-row-select="1"]').click();await page.getByRole('button',{name:'Duplicar',exact:true}).click();
  assert.equal(await page.locator('[data-inline-field="nome"]').inputValue(),'Recebimento de títulos (cópia)');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('.standard-data-table[data-table-editing="false"]').waitFor();
  assert.ok(db.prepare("SELECT id FROM gerenciador_naturezas WHERE nome='Recebimento de títulos (cópia)'").get());
});
test('erro preserva linhas do cadastro e navegação protege alterações pendentes',async t=>{
  const {page,db}=await fixture(t);
  await navigate(page,'gerenciador/naturezas');
  await page.getByRole('button',{name:'Cadastro rápido',exact:true}).click();
  await page.locator('[data-inline-field="nome"]').fill('Recebimento de títulos');await page.locator('[data-inline-field="classificacao"]').fill('Teste');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('[data-save-error]').waitFor();
  assert.equal(await page.locator('[data-inline-field="nome"]').inputValue(),'Recebimento de títulos');
  await page.locator('#sidebar').hover();await page.getByRole('link',{name:'Entidades',exact:true}).click();await page.locator('[data-confirm-cancel]').click();
  assert.ok(await page.locator('[data-inline-field="nome"]').isVisible());
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal(db.prepare('SELECT count(*) n FROM gerenciador_naturezas').get().n,4);
});
test('composição temporária isolada, confirmação, recarga e liquidação do mesmo título',async t=>{
  const {page,db}=await fixture(t);
  await navigate(page,'workflow/rastreio/conciliacao');
  assert.equal(await page.locator('[data-confirm-transfer]').isDisabled(),true);
  await sourceTitles(page);await page.locator('[data-title="101"]').click();
  assert.equal(db.prepare('SELECT count(*) n FROM workflow_rastreio_itens WHERE qprof_titulo_id=101').get().n,0);
  await page.locator('[data-transfer="2"]').click();assert.equal(await page.locator('[data-title="101"]').getAttribute('aria-pressed'),'false');
  await page.locator('[data-transfer="1"]').click();assert.equal(await page.locator('[data-title="101"]').getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:/^Vinculados/}).click();assert.equal(await page.locator('.title-table tbody tr').count(),1);
  await page.locator('[data-item-remove]').click();await page.getByRole('button',{name:'Todos os títulos',exact:true}).click();
  await compose(page);assert.equal(await page.locator('[data-confirm-transfer]').isEnabled(),true);
  await page.locator('[data-confirm-transfer]').click();await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal(db.prepare('SELECT count(*) n FROM workflow_rastreio_transferencias').get().n,3);
  await saveTransfer(page);await page.locator('[data-transfer="1"]').waitFor({state:'detached'});
  const conciliation=db.prepare('SELECT transferencia_id FROM workflow_rastreio_itens WHERE qprof_titulo_id=101').get().transferencia_id;assert.ok(conciliation);
  await page.reload();await page.locator('[data-transfer="2"]').waitFor();assert.equal(await page.locator('[data-transfer="1"]').count(),0);
  await page.getByRole('button',{name:'Liquidação',exact:true}).click();await compose(page);await saveTransfer(page);await page.locator('[data-transfer="11"]').waitFor({state:'detached'});
  const items=db.prepare('SELECT * FROM workflow_rastreio_itens WHERE qprof_titulo_id=101').all();assert.equal(items.length,2);assert.ok(items.some(item=>item.transferencia_id===conciliation));
});
test('composição usa filtros por coluna do Extrato sem alterar o filtro das pendências',async t=>{
  const {page}=await fixture(t);
  await navigate(page,'workflow/rastreio/conciliacao');
  const pendingFilter=page.locator('.rastreio-shell > .panel-card:not(.composition-panel) [data-table-control="filter"]');
  const titleFilter=page.locator('.composition-panel [data-table-control="filter"]');
  await pendingFilter.click();
  await page.locator('[data-filter-value]').fill('BOLETOS');
  await page.getByRole('button',{name:'Aplicar',exact:true}).click();
  assert.equal(await page.locator('[data-transfer]').count(),1);
  await titleFilter.click();
  await choose(page,'[data-filter-rule="0"] [data-filter-column]','Sacado');
  await page.locator('[data-filter-rule="0"] [data-filter-value]').fill('Nova');
  await page.locator('[data-filter-add]').click();
  await choose(page,'[data-filter-rule="1"] [data-filter-column]','Valor (R$)');
  await page.getByRole('textbox',{name:'Valor para Valor (R$)',exact:true}).fill('12.450,70');
  await page.screenshot({path:'test-results/filtro-composicao.png',fullPage:true});
  await page.getByRole('button',{name:'Aplicar',exact:true}).click();
  await page.locator('[data-title]').waitFor();assert.equal(await page.locator('[data-title]').count(),1);assert.equal(await page.locator('[data-title]').getAttribute('data-title'),'101');
  assert.match(await titleFilter.innerText(),/Filtrar \(2\)/);
  await titleFilter.click();await page.getByRole('button',{name:'Limpar',exact:true}).click();
  assert.equal(await page.locator('[data-title]').count(),0);assert.match(await page.locator('.title-table').innerText(),/Use a busca ou os filtros/);
  assert.equal(await page.locator('[data-transfer]').count(),1);
});
test('tema escuro, logo e perfil no menu; tabelas preservadas no mobile',async t=>{
  const {page}=await fixture(t);
  assert.equal(await page.locator('.rail-bottom [data-theme-toggle]').count(),0);
  assert.ok(await page.locator('.brand-logo img').isVisible());assert.ok(await page.locator('.rail-bottom .profile-avatar').isVisible());
  await page.locator('#sidebar').hover();await page.getByRole('button',{name:'Alternar tema'}).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.mouse.move(600,100);await navigate(page,'workflow/rastreio/conciliacao');
  await page.screenshot({path:'test-results/conciliacao-dark.png',fullPage:true});
  await page.reload();await page.locator('[data-transfer]').first().waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Página não deve ter overflow horizontal');
  assert.ok(await page.locator('.title-table').isVisible());
  assert.equal(await page.locator('.title-table-wrap').evaluate(el=>el.scrollWidth>el.clientWidth),true);
  await page.getByRole('button',{name:'Abrir menu'}).click();assert.ok(await page.getByRole('button',{name:'Alternar tema'}).isVisible());
  await page.getByRole('button',{name:'Alternar tema'}).click();await page.getByRole('button',{name:'Abrir menu'}).click();
  await page.screenshot({path:'test-results/conciliacao-mobile.png',fullPage:true});
});
test('erro ao carregar mostra estado de recuperação',async t=>{
  const {page}=await fixture(t);
  await page.route('**/api/workflow/extrato',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Serviço temporariamente indisponível.'})}));
  await page.reload();await page.getByRole('button',{name:'Tentar novamente'}).waitFor();
  await page.unroute('**/api/workflow/extrato');await page.getByRole('button',{name:'Tentar novamente'}).click();await page.locator('.standard-data-table').waitFor();
});

async function tablePosition(page,id) {
  return page.evaluate(id=>{
    const scroll=document.querySelector('.standard-data-table .table-scroll');
    const row=scroll.querySelector(`[data-record-row="${id}"]`);
    return {top:scroll.scrollTop,left:scroll.scrollLeft,rowY:row?.getBoundingClientRect().top-scroll.getBoundingClientRect().top,
      width:scroll.scrollWidth,windowY:window.scrollY,columns:[...scroll.querySelectorAll('thead th')].map(c=>c.getBoundingClientRect().width)};
  },id);
}
function assertStable(before,after) {
  for(const key of ['top','left','rowY','width','windowY'])assert.ok(Math.abs(before[key]-after[key])<=2,`${key}: ${before[key]} → ${after[key]}`);
  before.columns.forEach((width,index)=>assert.ok(Math.abs(width-after.columns[index])<=2,`Coluna ${index} mudou de largura`));
}

test('editar e cancelar no fim do extrato preservam registro, rolagem e colunas',async t=>{
  const {page}=await fixture(t,{width:1100,height:700});
  const id=await page.locator('[data-record-row]').last().getAttribute('data-record-row');
  await page.locator(`[data-row-edit="${id}"]`).scrollIntoViewIfNeeded();
  const before=await tablePosition(page,id);assert.equal(before.top,0);assert.ok(before.windowY>100);
  await page.locator(`[data-row-edit="${id}"]`).click();
  await page.waitForTimeout(80);
  assertStable(before,await tablePosition(page,id));
  const readable=await page.locator(`[data-record-row="${id}"] [data-date-proxy]`).evaluate(input=>{
    const style=getComputedStyle(input),context=document.createElement('canvas').getContext('2d');context.font=style.font;
    return input.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)>=context.measureText(input.value).width;
  });
  assert.ok(readable,'A data inteira deve caber no campo, com espaço para o calendário');
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  assertStable(before,await tablePosition(page,id));
});

test('salvar com teclado preserva os dois eixos e não desloca colunas ao digitar',async t=>{
  const {page,db}=await fixture(t,{width:1100,height:700});
  const id=await page.locator('[data-record-row]').last().getAttribute('data-record-row');
  await page.locator(`[data-row-edit="${id}"]`).scrollIntoViewIfNeeded();
  await page.locator(`[data-row-edit="${id}"]`).click();
  const money=page.locator(`[data-record-row="${id}"] .standard-number-field [data-input-proxy]`);
  await money.fill('1234567,89');
  await page.locator('.table-scroll').evaluate(el=>el.scrollLeft=el.scrollWidth);
  const before=await tablePosition(page,id);assert.ok(before.left>0);
  await money.fill('12345678,90');
  assertStable(before,await tablePosition(page,id));
  await money.press('Control+Enter');
  await page.locator('.standard-data-table[data-table-editing="false"]').waitFor();
  assertStable(before,await tablePosition(page,id));
  assert.equal(db.prepare('SELECT valor FROM workflow_extrato WHERE id=?').get(id).valor,1234567890);
  assert.equal(await page.locator(`[data-row-edit="${id}"]`).evaluate(el=>el===document.activeElement),true);
});

test('seletores e editor de histórico não movem a linha nem alargam a tabela',async t=>{
  const {page}=await fixture(t,{width:1100,height:700});
  const id=await page.locator('[data-record-row]').last().getAttribute('data-record-row');
  await page.locator(`[data-row-edit="${id}"]`).scrollIntoViewIfNeeded();
  await page.locator(`[data-row-edit="${id}"]`).click();
  const before=await tablePosition(page,id);
  await choose(page,`[data-record-id="${id}"][data-inline-field="natureza_id"]`,'Tarifa bancária');
  assertStable(before,await tablePosition(page,id));
  const history=page.locator(`[data-record-id="${id}"][data-inline-field="historico"]`);
  await history.click();
  const afterOpen=await tablePosition(page,id);
  await page.locator('.standard-text-editor textarea').fill('Histórico operacional detalhado '.repeat(30));
  await page.getByRole('button',{name:'Concluir',exact:true}).click();
  assertStable(afterOpen,await tablePosition(page,id));
  assert.equal(await history.inputValue(),'Histórico operacional detalhado '.repeat(30));
  await page.screenshot({path:'test-results/extrato-edicao-estavel.png',fullPage:true});
});

test('falha ao salvar conserva campos e posição e permite tentar novamente',async t=>{
  const {page}=await fixture(t,{width:1100,height:700});
  const id=await page.locator('[data-record-row]').last().getAttribute('data-record-row');
  await page.locator(`[data-row-edit="${id}"]`).scrollIntoViewIfNeeded();
  await page.locator(`[data-row-edit="${id}"]`).click();
  await page.route('**/api/workflow/extrato/batch',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Falha simulada. Tente novamente.'})}));
  const money=page.locator(`[data-record-row="${id}"] .standard-number-field [data-input-proxy]`);
  await money.fill('321,50');
  const before=await tablePosition(page,id);
  await money.press('Control+Enter');await page.locator('[data-save-error]').waitFor();
  assertStable(before,await tablePosition(page,id));
  assert.equal(await page.locator(`[data-record-id="${id}"][data-inline-field="valor_reais"]`).inputValue(),'321.50');
  assert.equal(await money.isEnabled(),true);
  assert.equal(await money.evaluate(el=>el===document.activeElement),true,'Uma falha mantém o foco para corrigir ou tentar salvar pelo teclado');
  await page.unroute('**/api/workflow/extrato/batch');
  await money.press('Control+Enter');await page.locator('.standard-data-table[data-table-editing="false"]').waitFor();
  assertStable(before,await tablePosition(page,id));
});

test('remover rascunho fora do topo não volta ao último cadastro rápido',async t=>{
  const {page}=await fixture(t,{width:1100,height:700});
  for(let i=0;i<12;i++)await page.getByRole('button',{name:'Cadastro rápido',exact:true}).click();
  const id='draft-8';
  await page.locator(`[data-row-delete="${id}"]`).scrollIntoViewIfNeeded();
  const neighbor='draft-9',before=await tablePosition(page,neighbor);
  await page.locator(`[data-row-delete="${id}"]`).click();
  const after=await tablePosition(page,neighbor);
  assert.ok(Math.abs(after.rowY-before.rowY)<=50,'A remoção move apenas uma linha, sem saltar para outro rascunho');
  assert.equal(after.top,0);assert.ok(after.windowY>0);
  assert.equal(after.left,before.left);
  assert.equal(await page.locator(`[data-record-row="${id}"]`).count(),0);
});

test('seleção, confirmação e exclusão no final mantêm posição; paginação inicia no topo',async t=>{
  const {page}=await fixture(t,{width:1100,height:700});
  const id=await page.locator('[data-record-row]').last().getAttribute('data-record-row');
  await page.locator(`[data-row-edit="${id}"]`).scrollIntoViewIfNeeded();
  const before=await tablePosition(page,id);
  await page.locator(`[data-row-select="${id}"]`).click();
  assertStable(before,await tablePosition(page,id));
  await page.locator(`[data-row-select="${id}"]`).click();
  await page.locator(`[data-row-delete="${id}"]`).click();
  await page.locator('[data-confirm-cancel]').click();
  assertStable(before,await tablePosition(page,id));
  const neighbor=await page.locator('[data-record-row]').nth(13).getAttribute('data-record-row');
  const beforeDelete=await tablePosition(page,neighbor);
  await page.locator(`[data-row-delete="${id}"]`).click();
  await page.locator('[data-confirm-delete]').click();
  await page.locator(`[data-record-row="${id}"]`).waitFor({state:'detached'});
  assertStable(beforeDelete,await tablePosition(page,neighbor));
  await page.getByRole('button',{name:'Próxima página',exact:true}).click();
  assert.equal(await page.locator('.table-scroll').evaluate(el=>el.scrollTop),0);
});

test('edição em tela estreita preserva rolagem da página além da tabela',async t=>{
  const {page}=await fixture(t,{width:390,height:600});
  const id=await page.locator('[data-record-row]').last().getAttribute('data-record-row');
  await page.locator(`[data-row-edit="${id}"]`).scrollIntoViewIfNeeded();
  const button=page.locator(`[data-row-edit="${id}"]`);
  await button.scrollIntoViewIfNeeded();
  const before=await tablePosition(page,id);
  await button.click();
  assertStable(before,await tablePosition(page,id));
});

test('menu separa seções e páginas, mantém somente a logo no rail e identifica o sistema',async t=>{
  const {page}=await fixture(t);
  assert.equal(await page.locator('#sidebar img').count(),1);
  assert.equal(await page.locator('.sidebar-panel img').count(),0);
  assert.equal(await page.locator('.system-brand strong').innerText(),'ALLCREDIT');
  assert.equal(await page.locator('.system-brand span').innerText(),'FIDC System');
  const sections=[['dashboards','Dashboards',['Home']],['workflow','Workflow',['Extrato','Rastreio','Saldos']],['importacao','Importação',['Qprof','Extratos']],['gerenciador','Gerenciador',['Naturezas','Entidades','Contas','Acessos']]];
  assert.deepEqual(await page.locator('.rail-nav [data-section]').evaluateAll(nodes=>nodes.map(node=>node.dataset.section)),sections.map(([key])=>key));
  assert.notEqual(await page.locator('.sidebar-top').evaluate(node=>getComputedStyle(node).borderBottomStyle),'none');
  const initial=page.url();
  for(const [key,label,pages] of sections){
    await page.locator(`.rail-nav [data-section="${key}"]`).hover();
    await page.locator(`.rail-nav [data-section="${key}"]`).click();
    assert.equal(page.url(),initial,'Escolher uma seção não abandona a página atual');
    assert.equal(await page.locator('.section-title').innerText(),label.toLocaleUpperCase('pt-BR'));
    assert.deepEqual(await page.locator('#sectionPages .panel-item').allTextContents(),pages);
  }
  await page.screenshot({path:'test-results/menu-secoes.png',fullPage:true});
  await page.locator('.rail-nav [data-section="dashboards"]').hover();
  await page.getByRole('link',{name:'Home',exact:true}).click();
  await page.locator('.placeholder-dashboard').waitFor();
  assert.equal(await page.locator('#breadcrumbSection').innerText(),'Dashboards');
  assert.equal(await page.locator('#breadcrumbPage').innerText(),'Home');
  assert.match(page.url(),/#dashboards\/home$/);
});

test('Rastreio mantém abas de composição e pendências e resumo alinhados',async t=>{
  const {page}=await fixture(t);
  await page.locator('.rail-nav [data-section="workflow"]').hover();
  await page.getByRole('link',{name:'Rastreio',exact:true}).click();
  await page.locator('.rastreio-shell').waitFor();
  assert.match(page.url(),/#workflow\/rastreio\/conciliacao$/);
  assert.deepEqual(await page.locator('.task-view-button').allTextContents(),['Conciliação','Liquidação','Rastreio','Pendências']);
  assert.equal(await page.locator('.task-stat').last().locator('span').innerText(),'Conta');
  assert.equal(await page.locator('.task-stat').last().locator('strong').innerText(),'Singulare 89727720');
  await page.locator('.rastreio-shell > .panel-card:not(.composition-panel) [data-table-control="filter"]').click();
  assert.deepEqual(await page.locator('[data-filter-column] option').allTextContents(),['Histórico','Data','Valor']);
  await page.locator('[data-filter-cancel]').click();
  const tabs=await page.locator('.task-view-switch').boundingBox(),summary=await page.locator('.task-overview').boundingBox();
  assert.ok(Math.abs((tabs.y+tabs.height/2)-(summary.y+summary.height/2))<2);
  assert.equal(await page.locator('#topbar button').count(),0);
  assert.doesNotMatch(await page.locator('#pageCanvas').innerText(),/lastro|lastrear/i);
  await page.getByRole('button',{name:'Liquidação',exact:true}).click();
  assert.match(page.url(),/#workflow\/rastreio\/liquidacao$/);
  await page.reload();await page.locator('[data-transfer="11"]').waitFor();
  assert.equal(await page.getByRole('button',{name:'Liquidação',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.task-stat').last().locator('span').innerText(),'Conta');
  assert.equal(await page.locator('.task-stat').last().locator('strong').innerText(),'Singulare 89727720');
  await page.screenshot({path:'test-results/rastreio-liquidacao.png',fullPage:true});
  await page.locator('.rail-nav [data-section="workflow"]').hover();await page.getByRole('link',{name:'Extrato',exact:true}).click();
  await page.locator('.standard-data-table').waitFor();
  assert.equal(await page.locator('.operation-topline,.task-overview,.rastreio-shell').count(),0);
  await page.goBack();await page.locator('.rastreio-shell').waitFor();
  assert.equal(await page.getByRole('button',{name:'Liquidação',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Rastreio',exact:true}).click();
  await page.locator('[data-composition-view="rastreio"]').waitFor();
  assert.equal(await page.locator('.task-stat').last().locator('span').innerText(),'Contas');
  assert.equal(await page.locator('.task-stat').last().locator('strong').innerText(),'Todas');
});

test('importação Qprof e Extratos são páginas independentes e não dependem da API do Workflow',async t=>{
  const {page}=await fixture(t),requests=[];
  page.on('request',request=>{if(request.url().includes('/api/'))requests.push(request.url());});
  await navigate(page,'importacao/qprof');
  assert.equal(await page.locator('.import-card').count(),1);
  assert.match(await page.locator('.import-card h2').innerText(),/Qprof/);
  assert.equal(await page.getByRole('button',{name:'Selecionar arquivo'}).isDisabled(),false);
  await page.screenshot({path:'test-results/importacao-qprof.png',fullPage:true});
  await navigate(page,'importacao/extratos');
  assert.deepEqual(await page.locator('.import-card h2').allTextContents(),['Bradesco 57420-1','Singulare 89727720','Singulare 59697697']);
  await page.screenshot({path:'test-results/importacao-extratos.png',fullPage:true});
  await navigate(page,'dashboards/home');assert.ok(await page.locator('.placeholder-dashboard').isVisible());
  assert.equal(requests.length,2);assert.match(requests[0],/api\/importacao\/qprof$/);assert.match(requests[1],/api\/importacao\/extratos$/,'Extratos carrega apenas sua própria API');
});

test('Contas usa apenas a tabela e permite função Neutra, sem configuração separada',async t=>{
  const {page,url,db}=await fixture(t);
  for(const [key,label] of [['naturezas','Naturezas'],['entidades','Entidades'],['contas','Contas']]){
    await page.goto(`${url}/#gerenciador/${key}`);await page.locator('.standard-data-table').waitFor();
    assert.equal(await page.locator('#breadcrumbPage').innerText(),label);
    assert.equal(await page.locator('#headerTabs .header-tab,.task-view-switch,.reconciliation-summary').count(),0);
  }
  assert.equal(await page.getByRole('button',{name:'Configurar rastreio',exact:true}).count(),0);
  await page.locator('[data-row-edit="1"]').click();
  assert.deepEqual(await page.locator('[data-inline-field="funcao"] option').evaluateAll(options=>options.filter(option=>option.value).map(option=>option.textContent)),['Operacional','Neutra','Rastreada']);
  await choose(page,'[data-inline-field="funcao"]','Neutra');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();
  await page.locator('.standard-data-table[data-table-editing="false"]').waitFor();
  assert.equal(db.prepare('SELECT funcao FROM gerenciador_contas WHERE id=1').get().funcao,'neutra');
  await navigate(page,'workflow/extrato');
  assert.ok(await page.locator('.standard-data-table tbody tr').count()>0);
  assert.doesNotMatch(await page.locator('.standard-data-table tbody').innerText(),/Bradesco/);
  await page.getByRole('button',{name:'Cadastro rápido',exact:true}).click();
  assert.doesNotMatch(await page.locator('select[data-inline-field="conta_id"]').innerText(),/Bradesco/);
});

test('consulta de rastreio pelo Extrato carrega os detalhes sem dados globais de títulos',async t=>{
  const {page}=await fixture(t);
  await page.getByRole('button',{name:'Filtrar tabela',exact:true}).click();
  await choose(page,'[data-filter-value]','Conciliado');await page.getByRole('button',{name:'Aplicar',exact:true}).click();
  await page.locator('[data-transfer-trace]').first().click();
  await page.locator('dialog .title-table tbody tr').first().waitFor();
  assert.match(await page.locator('dialog').innerText(),/Total:.*Diferença:/);
});

test('menu mobile dá acesso a todas as seções e fecha após escolher uma página',async t=>{
  const {page}=await fixture(t,{width:390,height:844});
  await page.getByRole('button',{name:'Abrir menu'}).click();
  await page.locator('.mobile-sections [data-section="importacao"]').click();
  await page.getByRole('link',{name:'Extratos',exact:true}).click();await page.locator('.import-card').first().waitFor();
  assert.equal(await page.getByRole('button',{name:'Abrir menu'}).getAttribute('aria-expanded'),'false');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:'Abrir menu'}).click();
  await page.locator('.mobile-sections [data-section="gerenciador"]').click();
  assert.deepEqual(await page.locator('#sectionPages .panel-item').allTextContents(),['Naturezas','Entidades','Contas','Acessos']);
  await page.screenshot({path:'test-results/menu-mobile.png',fullPage:true});
  await page.getByRole('link',{name:'Entidades',exact:true}).click();await page.locator('.standard-data-table').waitFor();
  assert.match(page.url(),/#gerenciador\/entidades$/);
});

async function manualItem(page,type,value,title='') {
  await page.locator('[data-title-tab="vinculados"]').click();
  await page.locator('[data-item-new]').click();
  await choose(page,'dialog [name="tipo"]',type);
  if(title)await page.locator('dialog [name="titulo"]').fill(title);
  await page.locator('dialog [name="cedente"]').fill('Cedente teste');
  await page.locator('dialog [name="sacado"]').fill('Sacado teste');
  await page.locator('dialog').getByRole('textbox',{name:'Valor (R$)',exact:true}).fill(value);
  await page.locator('dialog').getByRole('button',{name:'Adicionar registro'}).click();
  await page.locator('dialog').waitFor({state:'detached'});
}
test('registro manual nas três abas, edição salva, desvinculação e PDF sem gerar extratos',async t=>{
  const {page,db}=await fixture(t),entryCount=db.prepare('SELECT count(*) n FROM workflow_extrato').get().n;
  await navigate(page,'workflow/rastreio/conciliacao');await page.locator('[data-transfer="3"]').click();
  await manualItem(page,'Custas','18.940,00','Ajuste inicial');await saveTransfer(page);
  await page.locator('[data-transfer="3"]').waitFor({state:'detached'});
  assert.equal(db.prepare('SELECT count(*) n FROM workflow_extrato').get().n,entryCount);
  await page.getByRole('button',{name:'Liquidação',exact:true}).click();await page.locator('[data-transfer="13"]').click();
  await manualItem(page,'Tarifa','21.990,75','Liquidação manual');await saveTransfer(page);
  await page.locator('[data-transfer="13"]').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Rastreio',exact:true}).click();await page.locator('[data-transfer="3"]').click();
  assert.ok(await page.locator('[data-transfer="13"]').isVisible());
  await page.locator('[data-confirm-transfer]').click();
  await page.locator('[data-item-edit]').click();await page.locator('dialog [name="cedente"]').fill('Cedente atualizado');
  await page.locator('dialog').getByRole('button',{name:'Aplicar alteração'}).click();await page.locator('dialog').waitFor({state:'detached'});
  assert.equal(await page.locator('[data-composition-pdf]').isDisabled(),true);
  await page.locator('[data-confirm-transfer]').click();await page.locator('[data-confirm-delete]').click();
  await page.locator('[data-composition-cancel]').waitFor({state:'hidden'});
  const transfer=db.prepare('SELECT id FROM workflow_rastreio_transferencias WHERE extrato_id=3').get();
  assert.equal(db.prepare('SELECT cedente FROM workflow_rastreio_itens WHERE transferencia_id=?').get(transfer.id).cedente,'Cedente atualizado');
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-composition-pdf]').click();const download=await downloadPromise;
  assert.match(download.suggestedFilename(),/composicao-TRF-\d{8}-\d+\.pdf/);await download.saveAs('test-results/composicao-interface.pdf');
  assert.equal(await page.locator('[data-composition-pdf]').innerText(),'PDF');
  await page.locator('[data-confirm-transfer]').click();
  await page.locator('[data-item-remove]').click();await manualItem(page,'Parcial','18.940,00','Parcial substituto');
  await page.locator('[data-confirm-transfer]').click();await page.locator('[data-confirm-delete]').click();await page.locator('[data-composition-cancel]').waitFor({state:'hidden'});
  assert.equal(db.prepare('SELECT tipo FROM workflow_rastreio_itens WHERE transferencia_id=?').get(transfer.id).tipo,'parcial');
  assert.equal(db.prepare('SELECT count(*) n FROM importacao_qprof_titulos').get().n,14);
  await page.screenshot({path:'test-results/rastreio-revisao.png',fullPage:true});
  await page.locator('[data-confirm-transfer]').click();
  await page.locator('[data-item-remove]').click();await page.locator('[data-confirm-transfer]').click();await page.locator('[data-confirm-delete]').click();
  await page.locator('[data-transfer="3"]').waitFor({state:'detached'});
  assert.equal(db.prepare('SELECT id FROM workflow_rastreio_transferencias WHERE extrato_id=3').get(),undefined);
  assert.ok(db.prepare('SELECT id FROM workflow_extrato WHERE id=3').get());
});
test('movimentação conciliada e rastreada permite editar todos os campos e excluir',async t=>{
  const {page,db}=await fixture(t);
  await page.getByRole('button',{name:'Filtrar tabela',exact:true}).click();await choose(page,'[data-filter-value]','Conciliado');await page.getByRole('button',{name:'Aplicar',exact:true}).click();
  await page.locator('[data-row-edit="20"]').click();
  assert.equal(await page.locator('[data-record-id="20"][data-inline-field]').count(),7);
  await page.getByRole('textbox',{name:'Valor (R$)',exact:true}).fill('15.001,00');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('.standard-data-table[data-table-editing="false"]').waitFor();
  assert.equal(db.prepare('SELECT valor FROM workflow_extrato WHERE id=20').get().valor,1500100);
  await page.locator('[data-row-delete="20"]').click();assert.match(await page.locator('.confirmation-backdrop').innerText(),/rastreio e seus itens/);
  await page.locator('[data-confirm-delete]').click();await page.locator('[data-record-row="20"]').waitFor({state:'detached'});
  assert.equal(db.prepare('SELECT count(*) n FROM importacao_qprof_titulos').get().n,14);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('Saldos lista todas as contas ativas, inclusive Neutra, e edita apenas saldo final',async t=>{
  const {page,db,url}=await fixture(t);
  db.exec("INSERT INTO gerenciador_contas(id,nome,funcao) VALUES(4,'Reserva neutra','neutra'); INSERT INTO gerenciador_contas(id,nome,funcao,status) VALUES(5,'Conta inativa','operacional','inactive')");
  await navigate(page,'workflow/saldos');await page.locator('[data-record-row="4"]').waitFor();
  assert.deepEqual(await page.locator('.data-table thead th').allTextContents(),['Ações','Conta','Saldo Sistema','Saldo Banco','Saldo final','Atualização']);
  assert.equal(await page.locator('.data-table tbody tr').count(),4);
  assert.equal(await page.locator('.operation-topline,.reconciliation-summary,[data-table-control="new"],[data-table-control="duplicate"],[data-row-delete]').count(),0);
  const expected=db.prepare('SELECT sum(valor) total FROM workflow_extrato WHERE conta_id=1').get().total;
  const formatted=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(expected/100);
  assert.equal((await page.locator('[data-record-row="1"] [data-column-key="saldo_sistema"]').textContent()).replaceAll('\u00a0',' '),formatted.replaceAll('\u00a0',' '));
  assert.equal(await page.locator('[data-record-row="4"] [data-column-key="saldo_banco"]').textContent(),'—');
  await page.locator('[data-row-edit="4"]').click();
  assert.equal(await page.locator('[data-inline-field]').count(),1);
  assert.equal(await page.locator('[data-inline-field]').getAttribute('data-inline-field'),'saldo_final_reais');
  await page.getByRole('textbox',{name:'Saldo final',exact:true}).fill('0,00');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('.standard-data-table[data-table-editing="false"]').waitFor();
  assert.equal(db.prepare('SELECT saldo_final FROM workflow_saldos WHERE conta_id=4').get().saldo_final,0);
  await page.locator('[data-row-edit="4"]').click();
  await page.getByRole('textbox',{name:'Saldo final',exact:true}).fill('-1.234,56');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('.standard-data-table[data-table-editing="false"]').waitFor();
  await page.goto(`${url}/#workflow/saldos`);await page.locator('[data-record-row="4"]').waitFor();
  assert.match(await page.locator('[data-record-row="4"] [data-column-key="saldo_final_reais"]').innerText(),/-R\$\s*1\.234,56/);
  await page.screenshot({path:'test-results/saldos.png',fullPage:true});
  await page.locator('[data-row-select="1"]').click();await page.locator('[data-row-select="4"]').click();
  await page.getByRole('button',{name:'Editar selecionados',exact:true}).click();
  assert.equal(await page.locator('[data-batch-field] option').count(),1);
});

test('Criar e Editar ficam bloqueados em Todos os títulos nas três abas; edição inline persiste',async t=>{
  const {page,db}=await fixture(t);
  for(const tab of ['conciliacao','liquidacao','rastreio']){
    await navigate(page,`workflow/rastreio/${tab}`);
    await page.locator('[data-title-tab="todos"]').click();
    assert.ok(await page.locator('[data-item-new]').isVisible());assert.ok(await page.locator('[data-item-new]').isDisabled());
    assert.ok(await page.locator('[data-items-edit]').isVisible());assert.ok(await page.locator('[data-items-edit]').isDisabled());
    await page.locator('[data-title-tab="vinculados"]').click();assert.equal(await page.locator('[data-item-new]').isDisabled(),tab==='rastreio');
  }
  await page.locator('[data-transfer="20"]').click();await page.locator('[data-confirm-transfer]').click();await page.locator('[data-items-edit]').click();
  assert.equal(await page.locator('[data-inline-field="cedente"]').count(),2);
  const first=page.locator('[data-inline-field="cedente"]').first();await first.fill('Cedente editado na tabela');
  assert.ok(await first.evaluate(input=>input===document.activeElement),'digitar não recria a tabela ou perde foco');
  assert.equal(await page.locator('[data-confirm-transfer]').isDisabled(),false);
  const amount=page.getByRole('textbox',{name:'Valor (R$)',exact:true}).first();
  await amount.fill('inválido');assert.equal(await page.locator('[data-confirm-transfer]').isDisabled(),true);
  await amount.fill('0,00');assert.equal(await page.locator('[data-confirm-transfer]').isDisabled(),true);
  await amount.fill('10.001,00');assert.equal(await page.locator('[data-confirm-transfer]').isDisabled(),true);
  assert.match(await page.locator('[data-composition-difference]').innerText(),/-R\$\s*1,00/);
  await amount.fill('10.000,00');assert.equal(await page.locator('[data-confirm-transfer]').isDisabled(),false);
  await choose(page,'.title-table tbody tr:first-child [data-inline-field="tipo"]','Parcial');
  await page.locator('[data-items-save]').click();
  await page.locator('[data-title-tab="todos"]').click();assert.ok(await page.locator('[data-items-edit]').isDisabled());
  await page.locator('[data-title-tab="vinculados"]').click();assert.match(await page.locator('.title-table tbody').innerText(),/Cedente editado na tabela/);
  await page.locator('[data-confirm-transfer]').click();await page.locator('[data-confirm-delete]').click();await page.locator('[data-composition-cancel]').waitFor({state:'hidden'});
  assert.equal(db.prepare('SELECT i.cedente FROM workflow_rastreio_itens i JOIN workflow_rastreio_transferencias tr ON tr.id=i.transferencia_id WHERE tr.extrato_id=20 ORDER BY i.id').get().cedente,'Cedente editado na tabela');
  assert.equal(db.prepare('SELECT count(*) n FROM workflow_extrato').get().n,29);
  await page.reload();await page.locator('[data-transfer="20"]').click();assert.match(await page.locator('.title-table tbody').innerText(),/Cedente editado na tabela/);
});

test('Rastreio inicia em consulta, libera ações por transferência e cancelar restaura a composição',async t=>{
  const {page,db}=await fixture(t);
  const before=db.prepare('SELECT * FROM workflow_rastreio_itens ORDER BY id').all();
  await navigate(page,'workflow/rastreio/rastreio');await page.locator('[data-transfer="20"]').click();
  const primary=page.locator('[data-confirm-transfer]');
  assert.equal(await primary.innerText(),'Editar');assert.ok(await primary.isEnabled());
  for(const selector of ['[data-items-edit]','[data-items-save]','[data-item-new]','[data-titles-select-all]','[data-item-remove]','[data-item-edit]']){
    for(const control of await page.locator(selector).all())assert.ok(await control.isDisabled(),selector);
  }
  assert.ok(await page.locator('[data-composition-pdf]').isEnabled());
  await page.locator('[data-title-tab="todos"]').click();await sourceTitles(page);
  assert.ok(await page.locator('[data-title="101"]').isDisabled());assert.ok(await page.locator('[data-titles-select-all]').isDisabled());
  await primary.click();assert.equal(await primary.innerText(),'Salvar alterações');
  assert.ok(await page.locator('[data-title="101"]').isEnabled());
  await page.locator('[data-composition-cancel]').click();assert.equal(await primary.innerText(),'Editar');
  await primary.click();await page.locator('[data-transfer="21"]').click();assert.equal(await primary.innerText(),'Editar');
  await page.locator('[data-transfer="20"]').click();assert.equal(await primary.innerText(),'Editar','a edição sem alterações termina ao trocar de transferência');
  await page.locator('[data-title-tab="vinculados"]').click();await primary.click();
  await page.locator('[data-item-remove]').first().click();assert.equal(await page.locator('[data-item-remove]').count(),1);
  await page.locator('[data-composition-cancel]').click();await page.locator('[data-confirm-delete]').click();
  assert.equal(await primary.innerText(),'Editar');assert.equal(await page.locator('[data-item-remove]').count(),2);
  assert.deepEqual(db.prepare('SELECT * FROM workflow_rastreio_itens ORDER BY id').all(),before);
  await page.reload();await page.locator('[data-transfer="20"]').click();assert.equal(await primary.innerText(),'Editar');
});

test('registro manual fica visível nas três abas apesar dos filtros; busca Qprof é preservada separadamente',async t=>{
  const {page,db}=await fixture(t),before=db.prepare('SELECT count(*) n FROM workflow_extrato').get().n;
  for(const tab of ['conciliacao','liquidacao','rastreio']){
    await navigate(page,`workflow/rastreio/${tab}`);
    if(tab==='rastreio')await page.locator('[data-confirm-transfer]').click();
    await page.locator('[data-title-tab="todos"]').click();await sourceTitles(page);
    await page.locator('#titleSearch').fill('Comercial Paulista');await page.locator('[data-title="102"]').waitFor();
    await page.locator('[data-title-tab="vinculados"]').click();assert.equal(await page.locator('#titleSearch').inputValue(),'');
    await page.locator('.composition-panel [data-table-control="filter"]').click();
    await choose(page,'[data-filter-column]','Tipo');await choose(page,'[data-filter-value]','Título');
    await page.getByRole('button',{name:'Aplicar',exact:true}).click();
    await page.locator('#titleSearch').fill('Busca sem resultados');
    await manualItem(page,'Custas','1,00',`Custas manuais ${tab}`);
    assert.equal(await page.locator('#titleSearch').inputValue(),'');
    assert.match(await page.locator('.title-table tbody').innerText(),new RegExp(`Custas manuais ${tab}`));
    await page.locator('[data-title-tab="todos"]').click();assert.equal(await page.locator('#titleSearch').inputValue(),'Comercial Paulista');
    await page.locator('[data-title="102"]').waitFor();assert.equal(await page.locator('[data-title]').count(),1);
    await page.locator('[data-title-tab="vinculados"]').click();assert.match(await page.locator('.title-table tbody').innerText(),new RegExp(`Custas manuais ${tab}`));
  }
  assert.equal(db.prepare('SELECT count(*) n FROM workflow_extrato').get().n,before,'rascunhos da composição não geram movimentações');
});

test('Conciliação e Liquidação padronizam Editar, Cancelar e Salvar sem perder os vínculos',async t=>{
  const {page}=await fixture(t);
  for(const tab of ['conciliacao','liquidacao']){
    await navigate(page,`workflow/rastreio/${tab}`);
    assert.ok(await page.locator('[data-items-save]').isDisabled());
    await sourceTitles(page);await page.locator('[data-title="101"]').click();
    await page.locator('[data-title-tab="vinculados"]').click();
    await page.locator('[data-items-edit]').click();
    assert.equal(await page.locator('[data-items-edit]').innerText(),'Cancelar');
    assert.equal(await page.locator('[data-items-save]').isDisabled(),false);
    await page.locator('[data-inline-field="cedente"]').fill('Descartar esta edição');
    await page.getByRole('textbox',{name:'Valor (R$)',exact:true}).fill('0,00');
    await page.locator('[data-items-edit]').click();
    assert.equal(await page.locator('[data-items-edit]').innerText(),'Editar');
    assert.ok(await page.locator('[data-items-save]').isDisabled());
    assert.equal(await page.locator('[data-item-remove]').count(),1);
    assert.doesNotMatch(await page.locator('.title-table tbody').innerText(),/Descartar esta edição/);
    await page.locator('[data-items-edit]').click();
    await page.locator('[data-inline-field="cedente"]').fill('Edição aplicada');
    await page.locator('[data-items-save]').click();
    assert.equal(await page.locator('[data-inline-field]').count(),0);
    assert.match(await page.locator('.title-table tbody').innerText(),/Edição aplicada/);
    await page.locator('[data-items-edit]').click();
    await page.locator('[data-inline-field="cedente"]').fill('Segunda edição descartada');
    await page.locator('[data-items-edit]').click();
    assert.match(await page.locator('.title-table tbody').innerText(),/Edição aplicada/);
    assert.doesNotMatch(await page.locator('.title-table tbody').innerText(),/Segunda edição descartada/);
  }
});

test('Extrato filtra contas ativas pelo cabeçalho, sincroniza filtros e não descarta edições',async t=>{
  const {page,db}=await fixture(t);
  db.exec("INSERT INTO gerenciador_contas(nome,funcao,status) VALUES('Reserva neutra','neutra','active'),('Conta inativa','operacional','inactive')");
  await page.reload();await page.locator('#extratoAccountFilter').waitFor({state:'attached'});
  assert.equal(await page.locator('#extratoAccountFilter').inputValue(),'');
  assert.deepEqual(await page.locator('#extratoAccountFilter option').allTextContents(),['Todas as contas','Bradesco 57420-1','Reserva neutra','Singulare 59697697','Singulare 89727720']);
  await choose(page,'#extratoAccountFilter','Singulare 89727720');
  const expected=db.prepare('SELECT count(*) n FROM workflow_extrato WHERE conta_id=2').get().n;
  assert.equal(await page.locator('[data-record-row]').count(),expected);
  assert.ok((await page.locator('[data-column-key="conta_id"]').allTextContents()).every(name=>name==='Singulare 89727720'));
  assert.match(await page.locator('[data-table-control="filter"]').innerText(),/1/);
  await page.locator('[data-table-control="filter"]').click();await page.locator('[data-filter-clear]').click();
  assert.equal(await page.locator('#extratoAccountFilter').inputValue(),'');
  assert.equal(await page.locator('[data-record-row]').count(),25);
  await page.locator('[data-row-edit]').first().click();
  assert.ok(await page.locator('.extrato-account-filter .standard-select-trigger').isDisabled());
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await choose(page,'#extratoAccountFilter','Reserva neutra');
  assert.equal(await page.locator('[data-record-row]').count(),0);
  await choose(page,'#extratoAccountFilter','Todas as contas');assert.equal(await page.locator('[data-record-row]').count(),25);
});
test('Extrato tem 25 linhas, rolagem somente horizontal e colunas fixas compactas',async t=>{
  const {page}=await fixture(t,{width:1100,height:700});
  const layout=await page.locator('.table-scroll').evaluate(scroll=>({height:scroll.clientHeight,content:scroll.scrollHeight,width:scroll.clientWidth,contentWidth:scroll.scrollWidth,
    columns:[...scroll.querySelectorAll('th')].map(cell=>cell.getBoundingClientRect().width)}));
  assert.ok(layout.height>1100);assert.equal(layout.height,layout.content);assert.ok(layout.contentWidth>layout.width);
  assert.ok(layout.columns[1]<=112);assert.ok(layout.columns[2]<=132);
  await page.screenshot({path:'test-results/extrato-25-linhas.png',fullPage:true});
  await page.locator('[data-row-edit]').last().scrollIntoViewIfNeeded();
  await page.getByRole('button',{name:'Próxima página',exact:true}).click();
  assert.equal(await page.locator('[data-record-row]').count(),4);
  assert.ok(await page.evaluate(()=>window.scrollY<100));
});

test('busca Qprof descarta respostas antigas e mantém o filtro aberto durante consultas',async t=>{
  const {page}=await fixture(t);await navigate(page,'workflow/rastreio/conciliacao');
  await page.route('**/api/importacao/qprof/titulos?**',async route=>{if(new URL(route.request().url()).searchParams.get('q')==='Nova')await new Promise(resolve=>setTimeout(resolve,650));await route.continue().catch(()=>{});});
  const first=page.waitForRequest(request=>request.url().includes('/qprof/titulos?')&&new URL(request.url()).searchParams.get('q')==='Nova');
  await page.locator('#titleSearch').fill('Nova');await first;
  await page.locator('#titleSearch').fill('Comercial Paulista');await page.locator('[data-title="102"]').waitFor();
  await page.waitForTimeout(700);assert.equal(await page.locator('[data-title]').count(),1);assert.equal(await page.locator('#titleSearch').inputValue(),'Comercial Paulista');
  await page.locator('#titleSearch').fill('Farm');
  await page.locator('.composition-panel [data-table-control="filter"]').click();await page.waitForTimeout(650);
  assert.ok(await page.locator('.standard-table-filter').isVisible());
  await page.locator('[data-filter-cancel]').click();await page.locator('[data-title]').first().waitFor();
  assert.ok(await page.locator('[data-title]').count()>1);
  await page.locator('#titleSearch').fill('');await page.waitForTimeout(300);assert.equal(await page.locator('[data-title]').count(),0);
});

test('filtro monetário aceita valores brasileiros copiados, milhares e negativos; inválidos não reaplicam valor anterior',async t=>{
  const {page,db}=await fixture(t);
  db.exec("INSERT INTO workflow_extrato(data,historico,valor,conta_id) VALUES('2026-09-18','MIL REAIS',100000,1)");await page.reload();await page.locator('[data-record-row]').first().waitFor();
  const filter=page.locator('[data-table-control="filter"]');
  await filter.click();await choose(page,'[data-filter-column]','Valor (R$)');
  let input=page.getByRole('textbox',{name:'Valor para Valor (R$)',exact:true});
  await input.fill('-R$ 3.250,00');await page.getByRole('button',{name:'Aplicar',exact:true}).click();
  assert.equal(await page.locator('[data-record-row]').count(),db.prepare('SELECT count(*) n FROM workflow_extrato WHERE valor=-325000').get().n);
  await filter.click();input=page.getByRole('textbox',{name:'Valor para Valor (R$)',exact:true});await input.fill('inválido');await page.getByRole('button',{name:'Aplicar',exact:true}).click();
  assert.ok(await page.locator('.standard-table-filter').isVisible());
  await input.fill('1.000');await page.getByRole('button',{name:'Aplicar',exact:true}).click();assert.equal(await page.locator('[data-record-row]').count(),1);assert.match(await page.locator('.data-table tbody').innerText(),/MIL REAIS/);
  await filter.click();await input.fill('48.325,70');await page.getByRole('button',{name:'Aplicar',exact:true}).click();assert.equal(await page.locator('[data-record-row]').count(),1);assert.equal(await page.locator('[data-record-row]').getAttribute('data-record-row'),'1');
});

test('Extrato preserva quatro casas ao filtrar e editar; Saldos e cadastros sem classificação continuam funcionais',async t=>{
  const {page,db,url}=await fixture(t);
  db.exec("INSERT INTO gerenciador_contas(id,nome,funcao) VALUES(10,'Conta de precisão','operacional')");
  const response=await page.request.put(`${url}/api/workflow/extrato/batch`,{data:{items:[
    {conta_id:10,data:'2026-09-20',historico:'Precisão original',valor_reais:'-11351.4275'},
    {conta_id:10,data:'2026-09-20',historico:'Outra precisão',valor_reais:'-11351.4276'}
  ]}});assert.equal(response.status(),200);const [first]=await response.json();
  await page.reload();await page.locator('[data-record-row]').first().waitFor();
  await page.locator('[data-table-control="filter"]').click();await choose(page,'[data-filter-column]','Valor (R$)');
  await page.getByRole('textbox',{name:'Valor para Valor (R$)',exact:true}).fill('-11.351,4275');
  await page.getByRole('button',{name:'Aplicar',exact:true}).click();
  assert.equal(await page.locator('[data-record-row]').count(),1);
  assert.match(await page.locator('.data-table tbody').innerText(),/11\.351,4275/);
  await page.locator(`[data-row-edit="${first.id}"]`).click();
  assert.equal(await page.getByRole('textbox',{name:'Valor (R$)',exact:true}).inputValue(),'-11.351,4275');
  await page.locator('[data-inline-field="historico"]').fill('Alteração somente de histórico');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('.standard-data-table[data-table-editing="false"]').waitFor();
  const saved=db.prepare('SELECT valor,valor_subcentavos FROM workflow_extrato WHERE id=?').get(first.id);assert.equal(saved.valor,-1135142);assert.equal(saved.valor_subcentavos,-75);
  await navigate(page,'workflow/saldos');await page.locator('[data-record-row="10"]').waitFor();
  assert.match(await page.locator('[data-record-row="10"] [data-column-key="saldo_sistema"]').innerText(),/22\.702,8551/);
  for(const kind of ['naturezas','entidades']){
    await navigate(page,`gerenciador/${kind}`);await page.getByRole('button',{name:'Cadastro rápido',exact:true}).click();
    await page.locator('[data-inline-field="nome"]').fill(`Cadastro real ${kind}`);
    await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('.standard-data-table[data-table-editing="false"]').waitFor();
    assert.equal(db.prepare(`SELECT classificacao FROM gerenciador_${kind} WHERE nome=?`).get(`Cadastro real ${kind}`).classificacao,'');
  }
});

test('Extrato seleciona todo o filtro entre páginas e exporta/importa Excel por ID após conferência',async t=>{
  const {page,db}=await fixture(t);
  for(let i=0;i<32;i++)db.prepare("INSERT INTO workflow_extrato(data,historico,valor,conta_id) VALUES('2026-09-18',?,10001,1)").run(`Lote Excel ${i}`);
  const beforeCount=db.prepare('SELECT count(*) n FROM workflow_extrato').get().n;
  await page.reload();await page.locator('[data-record-row]').first().waitFor();
  await page.locator('[data-table-control="filter"]').click();await choose(page,'[data-filter-column]','Histórico');await page.locator('[data-filter-value]').fill('Lote Excel');await page.getByRole('button',{name:'Aplicar',exact:true}).click();
  assert.equal(await page.locator('[data-record-row]').count(),25);
  await page.locator('[data-row-select]').first().click();await page.getByRole('button',{name:'Selecionar todos',exact:true}).click();assert.equal(await page.locator('.selection-summary').innerText(),'32 selecionado(s)');
  await page.getByRole('button',{name:'Próxima página',exact:true}).click();assert.equal(await page.locator('[data-record-row].selected').count(),7);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar',exact:true}).click();const download=await pending;assert.equal(download.suggestedFilename(),'extrato.xlsx');
  const book=XLSX.read(readFileSync(await download.path()),{type:'buffer'}),sheet=book.Sheets.Extrato;
  const records=XLSX.utils.sheet_to_json(sheet);assert.equal(records.length,32);assert.ok(records.every(row=>row['Histórico'].startsWith('Lote Excel')));assert.ok(records.every(row=>row['Valor (R$)']===100.01));
  const target=records[0].ID;sheet.F2={t:'s',v:'Editado por Excel'};sheet.G2={t:'n',v:-1234.56};sheet.B2={t:'s',v:'Conciliado'};
  const edited=XLSX.write(book,{type:'buffer',bookType:'xlsx'});
  await page.getByRole('button',{name:'Importar',exact:true}).click();await page.locator('[data-extrato-file]').setInputFiles({name:'extrato-editado.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:edited});
  assert.ok(await page.getByRole('button',{name:'Importar alterações',exact:true}).isDisabled());await page.getByRole('button',{name:'Conferir arquivo',exact:true}).click();await page.getByText('32 registros conferidos · 1 para atualizar · 31 sem alteração.',{exact:true}).waitFor();
  assert.equal(db.prepare('SELECT valor FROM workflow_extrato WHERE id=?').get(target).valor,10001,'conferência não grava');
  await page.getByRole('button',{name:'Importar alterações',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
  assert.equal(db.prepare('SELECT valor FROM workflow_extrato WHERE id=?').get(target).valor,-123456);assert.equal(db.prepare('SELECT status FROM workflow_extrato WHERE id=?').get(target).status,'reconciled');assert.equal(db.prepare('SELECT count(*) n FROM workflow_extrato').get().n,beforeCount);
  assert.equal(await page.locator('.selection-summary').innerText(),'Nenhum registro selecionado');
  await page.screenshot({path:'test-results/extrato-importacao-excel.png',fullPage:true});
});

async function filterControlTitle(page,title){
  await page.locator('[data-table-control="filter"]').click();await choose(page,'[data-filter-column]','Título / item');
  await page.locator('[data-filter-value]').fill(title);await page.getByRole('button',{name:'Aplicar',exact:true}).click();
}

test('Pendências exibe 25 recebimentos por página sem rolagem vertical interna',async t=>{
  const {page,db}=await fixture(t,{width:1440,height:800});
  const [entry]=saveExtratoRows(db,[{data:'2026-09-20',historico:'Recebimento novo',valor_reais:'26.00',conta_id:2}]);
  confirmTransfer(db,{extrato_id:entry.id,itens:Array.from({length:26},(_,i)=>({tipo:'titulo',titulo:`PENDENCIA-NOVA-${i}`,valor_reais:'1.00'}))});
  await navigate(page,'workflow/rastreio/pendencias');await filterControlTitle(page,'PENDENCIA-NOVA');
  assert.equal(await page.locator('.standard-data-table tbody tr').count(),25);
  const layout=await page.locator('.standard-data-table .table-scroll').evaluate(el=>({height:el.clientHeight,content:el.scrollHeight,max:getComputedStyle(el).maxHeight,mode:el.closest('.standard-data-table').dataset.scrollMode}));
  assert.equal(layout.mode,'page');assert.equal(layout.max,'none');assert.ok(layout.height>800*.65);assert.ok(layout.content<=layout.height+1);
  assert.equal(await page.locator('[data-page-tab="pendencias"] svg').count(),1);
});

test('login tem tema azul, valida senha e mantém sessão ao recarregar e reabrir navegador',async t=>{
  const {page,url}=await fixture(t);
  await page.context().clearCookies();await page.reload();await page.locator('.login-form').waitFor();
  assert.equal(await page.locator('.app-shell').isVisible(),false);
  await page.locator('.login-form [name=login]').fill(testCredentials.login);
  await page.locator('.login-form [name=senha]').fill('errada');await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Login ou senha inválidos.'}).waitFor();
  await page.locator('.login-form [name=senha]').fill(testCredentials.senha);
  await page.getByRole('button',{name:'Mostrar senha',exact:true}).click();assert.equal(await page.locator('.login-form [name=senha]').getAttribute('type'),'text');
  await page.getByRole('button',{name:'Ocultar senha',exact:true}).click();
  await page.screenshot({path:'test-results/login-allcredit.png',fullPage:true});
  await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.locator('.standard-data-table').waitFor();
  await page.reload();await page.locator('.standard-data-table').waitFor();
  const storageState=await page.context().storageState(),context=await browser.newContext({storageState});
  try{const reopened=await context.newPage();await reopened.goto(`${url}/#workflow/extrato`);await reopened.locator('.standard-data-table').waitFor();assert.equal(await reopened.locator('[data-profile-trigger]').innerText(),'TO');}finally{await context.close();}
  await page.locator('[data-profile-trigger]').click();await page.locator('[data-sign-out]').click();await page.locator('.login-form').waitFor();
  await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('.login-card').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  await page.screenshot({path:'test-results/login-allcredit-mobile.png',fullPage:true});
});

test('Acessos e card de contas: cadastra visualizador, troca permissão, exporta e mostra iniciais',async t=>{
  const {page,db}=await fixture(t);
  confirmTransfer(db,{extrato_id:1,itens:[101,102,103,104,105].map(qprof_titulo_id=>({qprof_titulo_id}))});
  await navigate(page,'gerenciador/acessos');await page.getByRole('button',{name:'Cadastrar acesso',exact:true}).click();
  await page.locator('dialog [name=login]').fill('leitura');await page.locator('dialog [name=senha]').fill('teste456');
  await choose(page,'dialog [name=acesso]','Visualizador');await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
  assert.equal(db.prepare("SELECT acesso FROM gerenciador_acessos WHERE login='leitura'").get().acesso,'visualizador');
  await page.locator('[data-profile-trigger]').click();await page.locator('[data-add-account]').click();
  await page.locator('dialog [name=login]').fill('leitura');await page.locator('dialog [name=senha]').fill('teste456');await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.locator('[data-profile-trigger][aria-label="Conta de leitura"]').waitFor();
  assert.equal(await page.getByRole('button',{name:'Cadastrar acesso',exact:true}).count(),0);assert.equal(await page.locator('[data-access-edit]').count(),0);
  await navigate(page,'workflow/extrato');await page.locator('.standard-data-table').waitFor();
  assert.equal(await page.locator('[data-row-edit],[data-row-delete],[data-table-control="import"],[data-table-control="new"]').count(),0);
  const download=page.waitForEvent('download');await page.locator('[data-table-control="export"]').click();assert.equal((await download).suggestedFilename(),'extrato.xlsx');
  await navigate(page,'workflow/rastreio/rastreio');await page.locator('[data-composition-view="rastreio"]').waitFor();
  assert.equal(await page.locator('[data-confirm-transfer]').isVisible(),false);assert.equal(await page.locator('[data-item-new]').isDisabled(),true);assert.equal(await page.locator('[data-items-edit]').isDisabled(),true);
  const pdf=page.waitForEvent('download');await page.locator('[data-composition-pdf]').click();assert.match((await pdf).suggestedFilename(),/\.pdf$/);
  for(const route of ['importacao/qprof','importacao/extratos']){await navigate(page,route);await page.locator('.import-readonly').first().waitFor();assert.equal(await page.locator('[type=file],[data-import-submit]').count(),0);}
  await page.locator('[data-profile-trigger]').click();assert.equal(await page.locator('[data-switch-account]').count(),2);
  assert.equal(await page.locator('.account-popover img,.account-popover [type=file]').count(),0);
  assert.equal(await page.locator('.account-current .account-avatar').innerText(),'L');
  const actions=await page.locator('.account-actions').evaluate(el=>['[data-add-account]','[data-sign-out]'].map(selector=>{const r=el.querySelector(selector).getBoundingClientRect();return {top:r.top,left:r.left};}));
  assert.equal(actions[0].top,actions[1].top);assert.ok(actions[0].left<actions[1].left);
  await page.screenshot({path:'test-results/perfil-contas-allcredit.png',fullPage:true});
  const operator=db.prepare('SELECT id FROM gerenciador_acessos WHERE login=?').get(testCredentials.login);
  await page.locator(`[data-switch-account="${operator.id}"]`).click();await page.locator('[data-profile-trigger][aria-label="Conta de teste_operador"]').waitFor();
  await navigate(page,'workflow/extrato');await page.locator('[data-table-control="new"]').waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.locator('[data-profile-trigger]').click();
  assert.ok(await page.locator('.account-popover').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
  await page.screenshot({path:'test-results/perfil-mobile-dark.png',fullPage:true});
  await page.keyboard.press('Escape');await page.locator('.account-popover').waitFor({state:'detached'});
  await page.locator('[data-profile-trigger]').click();await page.locator('[data-sign-out]').click();await page.locator('[data-profile-trigger][aria-label="Conta de leitura"]').waitFor();
  await page.locator('[data-profile-trigger]').click();assert.equal(await page.locator('[data-switch-account]').count(),1);await page.locator('[data-sign-out]').click();await page.locator('.login-form').waitFor();
});


test('importações sintéticas por arraste exigem confirmação e preservam separação dos dados',async t=>{
  const {page,db}=await fixture(t),count=db.prepare('SELECT count(*) n FROM workflow_extrato').get().n;
  await navigate(page,'importacao/qprof');await page.locator('[data-import-submit]').waitFor();
  const file=qprofFile();
  const transfer=await page.evaluateHandle(content=>{const data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob(content),c=>c.charCodeAt(0))],'titulos-demo.xlsx'));return data;},file.toString('base64'));
  await page.locator('.import-card').dispatchEvent('drop',{dataTransfer:transfer});await transfer.dispose();
  assert.equal(db.prepare('SELECT count(*) n FROM importacao_qprof_titulos').get().n,14);
  await page.locator('[data-import-submit]').click();await page.locator('.import-success').waitFor();
  assert.equal(db.prepare('SELECT count(*) n FROM importacao_qprof_titulos WHERE ativo=1').get().n,40);assert.equal(db.prepare('SELECT count(*) n FROM workflow_extrato').get().n,count);
  await navigate(page,'importacao/extratos');const card=page.locator('[data-import-source="singulare-89727720"]');await card.waitFor();
  const csv=singulareFile();await card.locator('[type=file]').setInputFiles({name:csv.filename,mimeType:'text/csv',buffer:csv.buffer});
  await card.locator('[data-import-start]').fill('2026-09-17');await card.locator('[data-import-end]').fill('2026-09-18');
  assert.equal(db.prepare('SELECT count(*) n FROM workflow_extrato').get().n,count);
  await card.locator('[data-import-submit]').click();await card.locator('.import-success').waitFor();
  assert.equal(db.prepare('SELECT count(*) n FROM workflow_extrato').get().n,count+2);
});

test('Todas as pendências usa saldo do domínio e soma seleção antes de salvar; busca mostra todas as transferências',async t=>{
  const {page,db}=await fixture(t);
  const movement=value=>saveExtratoRows(db,[{data:'2026-09-21',historico:'Teste busca de títulos',valor_reais:value,conta_id:2}])[0];
  const entry=confirmTransfer(db,{extrato_id:movement('100.00').id,itens:[{tipo:'titulo',titulo:'BUSCA-001',cedente:'Teste',valor_reais:'100.00'}]});
  const partial=confirmTransfer(db,{extrato_id:movement('-70.00').id,itens:[{tipo:'parcial',titulo:'BUSCA001',cedente:'Teste',valor_reais:'70.00'}]});
  const third=confirmTransfer(db,{extrato_id:movement('-10.00').id,itens:[{tipo:'parcial',titulo:'BUSCA-001',cedente:'Teste',valor_reais:'10.00'}]});
  movement('-20.00');
  await navigate(page,'workflow/rastreio/liquidacao');
  await page.locator('[data-title-tab="pendencias"]').click();
  await page.locator('#titleSearch').fill('BUSCA');
  const pending=page.locator('[data-pending-title]');await pending.waitFor();
  assert.equal(await pending.count(),1);assert.match(await page.locator('.title-table tbody').innerText(),/20,00/);
  await pending.click();assert.equal(await page.locator('[data-selected-count]').innerText(),'1');assert.match(await page.locator('[data-selected-total]').innerText(),/20,00/);
  assert.equal(db.prepare('SELECT count(*) n FROM workflow_rastreio_itens WHERE registro_id=?').get(entry.itens[0].registro_id).n,3,'seleção ainda não grava vínculos');
  await page.locator('[data-composition-cancel]').click();await page.getByRole('button',{name:'Descartar',exact:true}).click();
  await navigate(page,'workflow/rastreio/rastreio');await page.locator('#trackingTitleSearch').fill('busca 001');
  assert.equal(await page.locator('[data-transfer]').count(),3);
  for(const transfer of [entry,partial,third])assert.match(await page.locator('.transfer-list').innerText(),new RegExp(transfer.codigo));
  await page.screenshot({path:'test-results/rastreio-busca-titulo.png',fullPage:true});
  const last=confirmTransfer(db,{extrato_id:movement('-20.00').id,itens:[{tipo:'titulo',titulo:'BUSCA-001',cedente:'Teste',valor_reais:'20.00'}]});
  await navigate(page,'workflow/rastreio/pendencias');
  await page.waitForFunction(()=>!document.querySelector('.standard-data-table')?.textContent.includes('BUSCA-001'));
  assert.ok(last.id);
});
