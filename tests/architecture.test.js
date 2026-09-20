import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sections, resolveRoute, routeHash } from '../apps/system/frontend/src/app/routes.js';
const root=fileURLToPath(new URL('../',import.meta.url));
function files(folder){return readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(resolve(folder,entry.name)):[resolve(folder,entry.name)]);}

test('módulos não têm imports quebrados, ciclos ou componentes acoplados às páginas',()=>{
  const sources=files(resolve(root,'apps/system')).filter(path=>path.endsWith('.js'));
  const graph=new Map();
  for(const file of sources){
    const source=readFileSync(file,'utf8'),dependencies=[];
    for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
      const dependency=resolve(dirname(file),match[1]);
      assert.ok(existsSync(dependency),`${relative(root,file)} importa arquivo inexistente: ${match[1]}`);
      dependencies.push(dependency);
    }
    if(file.includes('/frontend/src/components/'))assert.ok(dependencies.every(path=>!path.includes('/features/')),`Componente compartilhado acoplado: ${file}`);
    graph.set(file,dependencies);
  }
  const visited=new Set(),stack=new Set();
  function visit(file){assert.ok(!stack.has(file),`Importação circular: ${relative(root,file)}`);if(visited.has(file))return;stack.add(file);for(const dep of graph.get(file)||[])visit(dep);stack.delete(file);visited.add(file);}
  sources.forEach(visit);
});
test('cada página navegável tem módulo próprio e rota canônica por seção/página',()=>{
  const frontend=resolve(root,'apps/system/frontend/src');
  const keys=new Set();
  for(const section of sections)for(const page of section.pages){
    const key=`${section.key}/${page.key}`;assert.ok(!keys.has(key));keys.add(key);
    assert.ok(existsSync(resolve(frontend,'features',key,'page.js')),`Página sem módulo: ${key}`);
    for(const tab of page.tabs?.map(([key])=>key)||[undefined]){
      const route={section:section.key,page:page.key,tab};assert.deepEqual(resolveRoute(routeHash(route)),route);
    }
  }
  assert.equal(keys.size,10);
});
test('código ativo usa nomenclatura atual e assets centralizados',()=>{
  assert.ok(!existsSync(resolve(root,'allcredit-transferencias-template')));
  assert.ok(!existsSync(resolve(root,'allcredit_logo.png')));
  assert.ok(existsSync(resolve(root,'apps/system/frontend/assets/allcredit-logo.png')));
  for(const file of files(resolve(root,'apps/system')).filter(path=>/\.(js|html|css)$/.test(path))){
    const source=readFileSync(file,'utf8');
    assert.doesNotMatch(source,/\b(workflow_titulos|workflow_transferencias|gerenciador_configuracoes|id_conciliacao|id_liquidacao)\b|lastro|lastread|features\/manager|template\.css/i,relative(root,file));
  }
});
