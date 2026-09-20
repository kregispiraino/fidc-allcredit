-- rebuild-referenced-tables
-- Account eligibility is independent of the movement sign. Preserve every balance and reference.
CREATE TABLE gerenciador_contas_novas (
 id INTEGER PRIMARY KEY, nome TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(nome)) BETWEEN 1 AND 160),
 funcao TEXT NOT NULL CHECK(funcao IN ('operacional','neutra','rastreada')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
INSERT INTO gerenciador_contas_novas(id,nome,funcao,status,created_at,updated_at)
 SELECT id,nome,CASE
   WHEN id IN (SELECT conta_id FROM importacao_extratos_fontes WHERE chave='singulare-89727720') OR nome='Singulare 89727720' THEN 'rastreada'
   WHEN id IN (SELECT conta_id FROM importacao_extratos_fontes WHERE chave='singulare-59697697') OR nome='Singulare 59697697' THEN 'operacional'
   WHEN funcao IN ('conciliacao','liquidacao') THEN 'operacional'
   ELSE funcao END,status,created_at,updated_at FROM gerenciador_contas;
DROP TABLE gerenciador_contas;
ALTER TABLE gerenciador_contas_novas RENAME TO gerenciador_contas;
CREATE TRIGGER gerenciador_contas_cria_saldo AFTER INSERT ON gerenciador_contas BEGIN
 INSERT INTO workflow_saldos(conta_id) VALUES(NEW.id);
END;
