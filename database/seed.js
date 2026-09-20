import { ensureImportAccounts } from '../apps/system/backend/src/modules/importacao/extratos/sources.js';
import { pathToFileURL } from 'node:url';
import { openDatabase, migrate, transaction } from '../apps/system/backend/src/infrastructure/database/connection.js';
import { confirmTransfer } from '../apps/system/backend/src/modules/workflow/rastreio/service.js';

export function seed(db) {
  if(db.prepare('SELECT count(*) total FROM workflow_extrato').get().total || db.prepare('SELECT count(*) total FROM gerenciador_contas').get().total) return false;
  transaction(db,()=>{
    const account=db.prepare('INSERT INTO gerenciador_contas(id,nome,funcao) VALUES(?,?,?)');
    account.run(1,'Bradesco 57420-1','operacional'); account.run(2,'Singulare 89727720','rastreada'); account.run(3,'Singulare 59697697','operacional');
    ensureImportAccounts(db);
    const entity=db.prepare('INSERT INTO gerenciador_entidades(id,nome,classificacao) VALUES(?,?,?)');
    [[1,'Conta Cobrança','Conta interna'],[2,'Conta Liquidação','Conta interna'],[3,'QI Tech','Instituição'],[4,'All Credit Capital','Empresa']].forEach(r=>entity.run(...r));
    const nature=db.prepare('INSERT INTO gerenciador_naturezas(id,nome,classificacao) VALUES(?,?,?)');
    [[1,'Recebimento de títulos','Entrada'],[2,'Transferência entre contas','Movimentação'],[3,'Tarifa bancária','Despesa'],[4,'Estorno','Ajuste']].forEach(r=>nature.run(...r));
    const entry=db.prepare('INSERT INTO workflow_extrato(id,data,historico,valor,conta_id,entidade_id,natureza_id,status) VALUES(?,?,?,?,?,?,?,?)');
    const movements=[
      [1,'2026-09-16','TRANSFERÊNCIA RECEBIDA · COBRANÇA',4832570,2,1,1,'pending'],
      [2,'2026-09-15','TRANSFERÊNCIA RECEBIDA · BOLETOS',7211042,2,1,1,'pending'],
      [3,'2026-09-14','CRÉDITO CONTA CONCILIAÇÃO',1894000,2,1,1,'pending'],
      [4,'2026-09-12','TRANSFERÊNCIA RECEBIDA',9678014,2,1,1,'pending'],
      [11,'2026-09-18','TRANSFERÊNCIA PARA LIQUIDAÇÃO · COBRANÇA',-4832570,2,2,2,'pending'],
      [12,'2026-09-17','TRANSFERÊNCIA PARA LIQUIDAÇÃO · BOLETOS',-7211042,2,2,2,'pending'],
      [13,'2026-09-16','TRANSFERÊNCIA PARA LIQUIDAÇÃO',-2199075,2,2,2,'pending'],
      [20,'2026-09-08','CRÉDITO · COMPOSIÇÃO CONCLUÍDA',1500000,2,1,1,'reconciled'],
      [21,'2026-09-11','DÉBITO · CICLO CONCLUÍDO',-1500000,2,2,2,'reconciled'],
      [22,'2026-09-10','CRÉDITO · AGUARDANDO LIQUIDAÇÃO',2199075,2,1,1,'reconciled'],
      [23,'2026-09-15','ESTORNO DE TARIFA',50000,3,3,4,'reversal']
    ];
    movements.forEach(r=>entry.run(...r));
    for(let i=0;i<18;i++) entry.run(30+i,`2026-09-${String(18-i%10).padStart(2,'0')}`,i%2?'PAGAMENTO OPERACIONAL':'TED RECEBIDA',i%2?-325000:999980,i%2?3:1,i%3?4:null,i%3?2:null,'pending');
    const title=db.prepare('INSERT INTO importacao_qprof_titulos(id,numero,sacado,data_liquidacao,valor) VALUES(?,?,?,?,?)');
    const titles=[
      [101,'128817001','Drogaria Nova Saúde',1245070],[102,'330001','Comercial Paulista',1587500],
      [103,'5219001','Farmácia Central',910000],[104,'16870001','Distribuidora Alpha',630000],
      [105,'917004','Gallaxxyfarma',460000],[106,'2556001','Rede Farma Sul',999980],
      [107,'11952002','Drogaria Horizonte',785000],[108,'558801','Comercial Primavera',5426062],
      [109,'732101','Farmácia São Lucas',1894000],[110,'6728901','Distribuidora Nacional',9678014],
      [201,'2026001','Rede Vitória',1000000],[202,'2026002','Farmácia Esperança',500000],
      [203,'2026003','Comercial Aurora',1200000],[204,'2026004','Drogaria Bem Estar',999075]
    ];
    titles.forEach(([id,number,payer,value],i)=>title.run(id,number,payer,id>=201?'2026-09-08':'2026-09-16',value));
  });
  db.exec('UPDATE importacao_qprof_base SET quantidade=(SELECT count(*) FROM importacao_qprof_titulos) WHERE id=1');
  confirmTransfer(db,{extrato_id:20,itens:[201,202].map(qprof_titulo_id=>({qprof_titulo_id}))});
  confirmTransfer(db,{extrato_id:21,itens:[201,202].map(qprof_titulo_id=>({qprof_titulo_id}))});
  confirmTransfer(db,{extrato_id:22,itens:[203,204].map(qprof_titulo_id=>({qprof_titulo_id}))});
  return true;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const db=openDatabase(); migrate(db);
  console.log(seed(db)?'Seed de desenvolvimento criado. Todos os dados são fictícios.':'Banco já contém dados; seed não aplicado.');
  db.close();
}
