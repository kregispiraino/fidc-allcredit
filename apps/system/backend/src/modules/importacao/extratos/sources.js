import { assert } from '../../../shared/errors.js';
export function sourceByKey(db,key) {
  const source=db.prepare('SELECT f.*,c.nome,c.status,c.funcao FROM importacao_extratos_fontes f LEFT JOIN gerenciador_contas c ON c.id=f.conta_id WHERE chave=?').get(key);
  assert(source,'Fonte de extrato não encontrada.',404);return source;
}
export function importSources(db) {
  return db.prepare(`SELECT f.chave,f.banco,f.numero,f.agencia,f.conta_id,c.nome,c.status,c.funcao,
    l.arquivo,l.created_at ultima_importacao,l.criados,l.duplicados,l.data_inicio,l.data_fim
    FROM importacao_extratos_fontes f LEFT JOIN gerenciador_contas c ON c.id=f.conta_id
    LEFT JOIN importacao_extratos_lotes l ON l.id=(SELECT MAX(id) FROM importacao_extratos_lotes WHERE fonte=f.chave)
    ORDER BY CASE f.banco WHEN 'bradesco' THEN 0 ELSE 1 END,f.numero DESC`).all();
}
// Called explicitly for a fresh development database or the authorized real-data setup.
export function ensureImportAccounts(db) {
  const definitions=[['bradesco-57420-1','Bradesco 57420-1','operacional'],['singulare-89727720','Singulare 89727720','rastreada'],['singulare-59697697','Singulare 59697697','operacional']];
  for(const [key,name,role] of definitions){
    let account=db.prepare('SELECT id FROM gerenciador_contas WHERE nome=?').get(name);
    if(!account){const result=db.prepare('INSERT INTO gerenciador_contas(nome,funcao) VALUES(?,?)').run(name,role);account={id:Number(result.lastInsertRowid)};}
    db.prepare('UPDATE importacao_extratos_fontes SET conta_id=? WHERE chave=?').run(account.id,key);
  }
}
