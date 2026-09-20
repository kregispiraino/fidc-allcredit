import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../../../../../', import.meta.url));
export function openDatabase(filename = process.env.ALLCREDIT_DB || resolve(projectRoot, 'database/allcredit.sqlite')) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  return db;
}
export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS sistema_migrations (nome TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const folder = resolve(projectRoot, 'database/migrations');
  for (const file of readdirSync(folder).filter(f => f.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT 1 FROM sistema_migrations WHERE nome=?').get(file)) continue;
    const sql=readFileSync(resolve(folder,file),'utf8');
    const rebuild=sql.startsWith('-- rebuild-referenced-tables');
    // SQLite requires FK enforcement off outside the transaction when rebuilding a referenced table.
    if(rebuild)db.exec('PRAGMA foreign_keys=OFF');
    try {
      transaction(db,()=>{
        db.exec(sql);
        if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error(`Referências inválidas na migração ${file}`);
        db.prepare('INSERT INTO sistema_migrations(nome) VALUES(?)').run(file);
      });
    } finally { if(rebuild)db.exec('PRAGMA foreign_keys=ON'); }
  }
}
