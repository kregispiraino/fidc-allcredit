-- rebuild-referenced-tables
-- Rebuild the account function constraint; the runner checks all foreign keys before commit.
DROP TABLE gerenciador_contas_configuracoes;
CREATE TABLE gerenciador_contas_novas (
 id INTEGER PRIMARY KEY, nome TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(nome)) BETWEEN 1 AND 160),
 funcao TEXT NOT NULL CHECK(funcao IN ('conciliacao','liquidacao','operacional','neutra')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
INSERT INTO gerenciador_contas_novas SELECT * FROM gerenciador_contas;
DROP TABLE gerenciador_contas;
ALTER TABLE gerenciador_contas_novas RENAME TO gerenciador_contas;
CREATE TABLE workflow_saldos (
 conta_id INTEGER PRIMARY KEY REFERENCES gerenciador_contas(id) ON DELETE CASCADE,
 saldo_askora INTEGER NOT NULL DEFAULT 0,
 saldo_banco INTEGER,
 saldo_final INTEGER CHECK(saldo_final IS NULL OR abs(saldo_final)<=9000000000000),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
INSERT INTO workflow_saldos(conta_id,saldo_askora)
 SELECT c.id,COALESCE(SUM(e.valor),0) FROM gerenciador_contas c LEFT JOIN workflow_extrato e ON e.conta_id=c.id GROUP BY c.id;
CREATE TRIGGER gerenciador_contas_cria_saldo AFTER INSERT ON gerenciador_contas BEGIN
 INSERT INTO workflow_saldos(conta_id) VALUES(NEW.id);
END;
CREATE TRIGGER workflow_extrato_saldo_insert AFTER INSERT ON workflow_extrato BEGIN
 UPDATE workflow_saldos SET saldo_askora=saldo_askora+NEW.valor,updated_at=CURRENT_TIMESTAMP WHERE conta_id=NEW.conta_id;
END;
CREATE TRIGGER workflow_extrato_saldo_delete AFTER DELETE ON workflow_extrato BEGIN
 UPDATE workflow_saldos SET saldo_askora=saldo_askora-OLD.valor,updated_at=CURRENT_TIMESTAMP WHERE conta_id=OLD.conta_id;
END;
CREATE TRIGGER workflow_extrato_saldo_update AFTER UPDATE ON workflow_extrato BEGIN
 UPDATE workflow_saldos SET saldo_askora=saldo_askora-OLD.valor,updated_at=CURRENT_TIMESTAMP WHERE conta_id=OLD.conta_id;
 UPDATE workflow_saldos SET saldo_askora=saldo_askora+NEW.valor,updated_at=CURRENT_TIMESTAMP WHERE conta_id=NEW.conta_id;
END;
