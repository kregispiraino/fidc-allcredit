import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { openDatabase, migrate } from '../apps/system/backend/src/infrastructure/database/connection.js';

// Deliberately uses historical names: exercise an existing installation, not only a fresh seed.
test('migração por seção/página preserva um ciclo já confirmado e sua auditoria',t=>{
  const db=openDatabase(':memory:');t.after(()=>db.close());
  db.exec(readFileSync(new URL('../database/migrations/001_workflow.sql',import.meta.url),'utf8'));
  db.exec(`CREATE TABLE sistema_migrations(nome TEXT PRIMARY KEY,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO sistema_migrations(nome) VALUES('001_workflow.sql');
    INSERT INTO gerenciador_contas(id,nome,funcao) VALUES(2,'Conta existente','conciliacao');
    UPDATE gerenciador_configuracoes SET conta_conciliacao_id=2,conta_liquidacao_id=2 WHERE id=1;
    INSERT INTO gerenciador_naturezas(id,nome,classificacao) VALUES(8,'Natureza existente','Entrada');
    INSERT INTO gerenciador_entidades(id,nome,classificacao) VALUES(6,'Entidade existente','Empresa');
    INSERT INTO workflow_extrato(id,data,historico,valor,conta_id,entidade_id,natureza_id)
      VALUES(41,'2026-09-01','Crédito já conferido',123456,2,6,8),(42,'2026-09-05','Débito já conferido',-123456,2,6,8);
    INSERT INTO workflow_titulos(id,numero,sacado,valor,vencimento) VALUES(71,'Existente-71','Sacado existente',123456,'2026-09-01');
    INSERT INTO workflow_transferencias(id,extrato_id,tipo,valor,data) VALUES(91,41,'conciliacao',123456,'2026-09-01');
    UPDATE workflow_titulos SET id_conciliacao=91 WHERE id=71;
    UPDATE workflow_extrato SET id_conciliacao=91,status='reconciled' WHERE id=41;
    INSERT INTO workflow_transferencias(id,extrato_id,tipo,valor,data) VALUES(92,42,'liquidacao',123456,'2026-09-05');
    UPDATE workflow_titulos SET id_liquidacao=92 WHERE id=71;
    UPDATE workflow_extrato SET id_liquidacao=92,status='reconciled' WHERE id=42;`);
  const before={
    entries:db.prepare('SELECT * FROM workflow_extrato ORDER BY id').all(),
    titles:db.prepare('SELECT * FROM workflow_titulos ORDER BY id').all(),
    transfers:db.prepare('SELECT * FROM workflow_transferencias ORDER BY id').all(),
    accounts:db.prepare('SELECT * FROM gerenciador_contas').all()
  };
  const strip=rows=>rows.map(({id_conciliacao,id_liquidacao,...row})=>row);
  const plain=rows=>rows.map(row=>({...row}));
  migrate(db);migrate(db);
  assert.deepEqual(plain(db.prepare('SELECT * FROM workflow_extrato ORDER BY id').all()),strip(before.entries).map(row=>({...row,valor_subcentavos:0,rastreio_condicao:'aplicavel'})));
  assert.deepEqual(plain(db.prepare('SELECT * FROM importacao_qprof_titulos ORDER BY id').all()),strip(before.titles).map(({documento,vencimento,pagamento,...row})=>({...row,cedente:'',data_liquidacao:pagamento,carteira:'',carteira_interna:'',ativo:1})));
  assert.deepEqual(plain(db.prepare('SELECT * FROM gerenciador_contas').all()),plain(before.accounts).map(row=>({...row,funcao:'operacional'})));
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='gerenciador_contas_configuracoes'").get(),undefined);
  assert.equal(db.prepare('SELECT saldo_sistema FROM workflow_saldos WHERE conta_id=2').get().saldo_sistema,0);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  const transfers=db.prepare('SELECT * FROM workflow_rastreio_transferencias ORDER BY id').all();
  assert.ok(transfers.every(row=>/^TRF-\d{8}-\d{2,}$/.test(row.codigo)));
  assert.deepEqual(transfers.map(({id,extrato_id,versao,created_at,updated_at})=>({id,extrato_id,versao,created_at,updated_at})),before.transfers.map(({tipo,valor,data,...row})=>({...row,versao:1})));
  const items=db.prepare('SELECT * FROM workflow_rastreio_itens ORDER BY transferencia_id').all();
  assert.equal(items.length,2);assert.deepEqual(items.map(item=>item.transferencia_id),[91,92]);
  assert.ok(items.every(item=>item.qprof_titulo_id===71&&item.titulo==='Existente-71'&&item.valor===123456));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  db.exec('UPDATE workflow_extrato SET valor=1 WHERE id=41');
  assert.equal(db.prepare('SELECT valor FROM workflow_rastreio_itens WHERE transferencia_id=91').get().valor,123456);
  db.exec('DELETE FROM workflow_extrato WHERE id=41');
  assert.equal(db.prepare('SELECT count(*) n FROM workflow_rastreio_itens WHERE transferencia_id=91').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM importacao_qprof_titulos').get().n,1);
});

test('migração das funções preserva saldos, importações e composições das duas contas Singulare',t=>{
  const db=openDatabase(':memory:');t.after(()=>db.close());
  const folder=new URL('../database/migrations/',import.meta.url);
  db.exec('CREATE TABLE sistema_migrations(nome TEXT PRIMARY KEY,applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  // Reproduce the installation immediately before the account function change.
  for(const name of readdirSync(folder).filter(name=>name.endsWith('.sql')&&name<'008').sort()){
    db.exec('PRAGMA foreign_keys=OFF');db.exec(readFileSync(new URL(name,folder),'utf8'));
    db.prepare('INSERT INTO sistema_migrations(nome) VALUES(?)').run(name);db.exec('PRAGMA foreign_keys=ON');
  }
  db.exec(`INSERT INTO gerenciador_contas(id,nome,funcao) VALUES
    (1,'Bradesco 57420-1','operacional'),(2,'Singulare 89727720','conciliacao'),
    (3,'Singulare 59697697','liquidacao'),(4,'Reserva','neutra');
    UPDATE importacao_extratos_fontes SET conta_id=2 WHERE chave='singulare-89727720';
    UPDATE importacao_extratos_fontes SET conta_id=3 WHERE chave='singulare-59697697';
    INSERT INTO workflow_extrato(id,data,historico,valor,conta_id) VALUES
    (1,'2026-09-18','Crédito importado',1000,2),(2,'2026-09-18','Débito com composição',-1000,3);
    INSERT INTO workflow_rastreio_transferencias(id,extrato_id,versao) VALUES(1,2,7);
    INSERT INTO workflow_rastreio_itens(transferencia_id,tipo,titulo,valor) VALUES(1,'custas','Ajuste preservado',1000);
    INSERT INTO importacao_extratos_lotes(id,fonte,arquivo,arquivo_hash,data_inicio,data_fim,criados,duplicados,fora_periodo)
      VALUES(1,'singulare-89727720','extrato.csv','hash','2026-09-18','2026-09-18',1,0,0);
    INSERT INTO importacao_extratos_registros(conta_id,chave,extrato_id,lote_id,data_hora,documento,valor)
      VALUES(2,'movimento',1,1,'2026-09-18 16:17:39','123',1000);
    UPDATE workflow_saldos SET saldo_banco=42461018,saldo_final=42461018,updated_at='2026-09-18 16:17:39' WHERE conta_id=2;`);
  const tables=['workflow_saldos','workflow_extrato','workflow_rastreio_transferencias','workflow_rastreio_itens','importacao_extratos_fontes','importacao_extratos_lotes','importacao_extratos_registros'];
  const before=tables.map(table=>db.prepare(`SELECT * FROM ${table}`).all());
  migrate(db);migrate(db);
  assert.deepEqual(db.prepare('SELECT funcao FROM gerenciador_contas ORDER BY id').all().map(row=>row.funcao),['operacional','rastreada','operacional','neutra']);
  for(const [i,table] of tables.entries()){
    const after=db.prepare(`SELECT * FROM ${table}`).all();
    for(const row of after){if(table==='workflow_extrato'){assert.equal(row.valor_subcentavos,0);delete row.valor_subcentavos;assert.equal(row.rastreio_condicao,'aplicavel');delete row.rastreio_condicao;}if(table==='workflow_saldos'){assert.equal(row.saldo_sistema_subcentavos,0);delete row.saldo_sistema_subcentavos;}}
    const originalKeys=Object.keys(before[i][0]||{});
    assert.deepEqual(after.map(row=>Object.fromEntries(originalKeys.map(key=>[key,row[key]]))),before[i].map(row=>({...row})),table);
  }
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.throws(()=>db.exec("UPDATE gerenciador_contas SET funcao='conciliacao' WHERE id=2"),/CHECK/);
  assert.throws(()=>db.exec("UPDATE gerenciador_contas SET funcao='liquidacao' WHERE id=3"),/CHECK/);
  db.exec("INSERT INTO gerenciador_contas(id,nome,funcao) VALUES(5,'Nova conta','rastreada')");
  assert.equal(db.prepare('SELECT saldo_sistema FROM workflow_saldos WHERE conta_id=5').get().saldo_sistema,0);
  db.exec("INSERT INTO workflow_extrato(data,historico,valor,conta_id) VALUES('2026-09-19','Teste',123,5)");
  assert.equal(db.prepare('SELECT saldo_sistema FROM workflow_saldos WHERE conta_id=5').get().saldo_sistema,123);
});

test('normalização dos cinco tipos preserva IDs, valores, compensações, auditoria e sequências',t=>{
  const db=openDatabase(':memory:');t.after(()=>db.close());const folder=new URL('../database/migrations/',import.meta.url);
  db.exec('CREATE TABLE sistema_migrations(nome TEXT PRIMARY KEY,applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  for(const name of readdirSync(folder).filter(n=>n.endsWith('.sql')&&n<'012').sort()){
    db.exec('PRAGMA foreign_keys=OFF');db.exec(readFileSync(new URL(name,folder),'utf8'));db.prepare('INSERT INTO sistema_migrations(nome) VALUES(?)').run(name);db.exec('PRAGMA foreign_keys=ON');
  }
  db.exec("INSERT INTO gerenciador_contas(id,nome,funcao) VALUES(1,'Conta de teste','rastreada'); INSERT INTO workflow_extrato(id,data,historico,valor,conta_id) VALUES(1,'2026-09-20','Transferência preservada',100,1); INSERT INTO workflow_rastreio_transferencias(id,extrato_id) VALUES(1,1)");
  for(const [i,tipo] of ['ajuste_saldo','recebimento_sem_titulo','devolucao_ajuste','divergencia'].entries()){
    db.prepare('INSERT INTO workflow_rastreio_registros(id,tipo,valor,observacao) VALUES(?,?,25,?)').run(i+1,tipo,'Observação '+tipo);
    db.prepare('INSERT INTO workflow_rastreio_itens(id,transferencia_id,registro_id,tipo,valor) VALUES(?,1,?,?,25)').run(i+1,i+1,tipo);
  }
  db.exec("UPDATE workflow_rastreio_itens SET efeito='compensacao',compensa_registro_id=1 WHERE id=4; INSERT INTO workflow_rastreio_registros(id,tipo,valor) VALUES(99,'custas',1); DELETE FROM workflow_rastreio_registros WHERE id=99; INSERT INTO workflow_rastreio_itens(id,transferencia_id,tipo,valor) VALUES(99,1,'custas',1); DELETE FROM workflow_rastreio_itens WHERE id=99");
  const before=db.prepare('SELECT * FROM workflow_rastreio_itens ORDER BY id').all(),entries=db.prepare('SELECT * FROM workflow_extrato').all(),balances=db.prepare('SELECT * FROM workflow_saldos').all();
  migrate(db);migrate(db);
  const after=db.prepare('SELECT * FROM workflow_rastreio_itens ORDER BY id').all();
  assert.deepEqual(after.map(({tipo_origem,...r})=>r),before.map(r=>({...r,tipo:'ajuste'})));assert.deepEqual(after.map(r=>r.tipo_origem),before.map(r=>r.tipo));
  assert.deepEqual(db.prepare('SELECT * FROM workflow_extrato').all(),entries);assert.deepEqual(db.prepare('SELECT * FROM workflow_saldos').all(),balances);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  for(const tipo of ['ajuste_saldo','recebimento_sem_titulo','devolucao_ajuste','divergencia','qualquer']){
    assert.throws(()=>db.prepare('INSERT INTO workflow_rastreio_registros(tipo,valor) VALUES(?,1)').run(tipo),/CHECK/);
    assert.throws(()=>db.prepare('UPDATE workflow_rastreio_itens SET tipo=? WHERE id=1').run(tipo),/CHECK/);
  }
  assert.equal(Number(db.prepare("INSERT INTO workflow_rastreio_registros(tipo,valor) VALUES('ajuste',1)").run().lastInsertRowid),100);
  assert.equal(Number(db.prepare("INSERT INTO workflow_rastreio_itens(transferencia_id,tipo,valor) VALUES(1,'ajuste',1)").run().lastInsertRowid),100);
});
