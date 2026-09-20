-- Canonical account names; existing records and IDs are preserved.
UPDATE gerenciador_contas SET nome='Singulare 89727720' WHERE nome='Singulare 89';
UPDATE gerenciador_contas SET nome='Singulare 59697697' WHERE nome='Singulare 59';
UPDATE gerenciador_contas SET nome='Bradesco 57420-1' WHERE nome='Bradesco';
CREATE TABLE importacao_extratos_fontes (
 chave TEXT PRIMARY KEY,
 banco TEXT NOT NULL CHECK(banco IN ('bradesco','singulare')),
 numero TEXT NOT NULL,
 agencia TEXT,
 conta_id INTEGER UNIQUE REFERENCES gerenciador_contas(id) ON DELETE RESTRICT,
 saldo_data TEXT,
 saldo_ordem INTEGER NOT NULL DEFAULT 0
) STRICT;
INSERT INTO importacao_extratos_fontes(chave,banco,numero,agencia,conta_id) VALUES
 ('bradesco-57420-1','bradesco','57420-1','3',(SELECT id FROM gerenciador_contas WHERE nome='Bradesco 57420-1')),
 ('singulare-89727720','singulare','89727720',NULL,(SELECT id FROM gerenciador_contas WHERE nome='Singulare 89727720')),
 ('singulare-59697697','singulare','59697697',NULL,(SELECT id FROM gerenciador_contas WHERE nome='Singulare 59697697'));
CREATE TABLE importacao_extratos_lotes (
 id INTEGER PRIMARY KEY,
 fonte TEXT NOT NULL REFERENCES importacao_extratos_fontes(chave),
 arquivo TEXT NOT NULL, arquivo_hash TEXT NOT NULL,
 data_inicio TEXT NOT NULL, data_fim TEXT NOT NULL,
 criados INTEGER NOT NULL, duplicados INTEGER NOT NULL, fora_periodo INTEGER NOT NULL,
 saldo_data TEXT, saldo_atualizado INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE TABLE importacao_extratos_registros (
 conta_id INTEGER NOT NULL REFERENCES gerenciador_contas(id),
 chave TEXT NOT NULL,
 extrato_id INTEGER UNIQUE REFERENCES workflow_extrato(id) ON DELETE SET NULL,
 lote_id INTEGER NOT NULL REFERENCES importacao_extratos_lotes(id),
 data_hora TEXT NOT NULL, documento TEXT NOT NULL, valor INTEGER NOT NULL,
 PRIMARY KEY(conta_id,chave)
) STRICT;
CREATE INDEX importacao_extratos_lotes_fonte ON importacao_extratos_lotes(fonte,id);
-- Once bank data exists, the displayed update date is its observation date,
-- not the time of a local classification, edit or repeated import.
DROP TRIGGER workflow_extrato_saldo_insert;
DROP TRIGGER workflow_extrato_saldo_delete;
DROP TRIGGER workflow_extrato_saldo_update;
CREATE TRIGGER workflow_extrato_saldo_insert AFTER INSERT ON workflow_extrato BEGIN
 UPDATE workflow_saldos SET saldo_sistema=saldo_sistema+NEW.valor,updated_at=CASE WHEN saldo_banco IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END WHERE conta_id=NEW.conta_id;
END;
CREATE TRIGGER workflow_extrato_saldo_delete AFTER DELETE ON workflow_extrato BEGIN
 UPDATE workflow_saldos SET saldo_sistema=saldo_sistema-OLD.valor,updated_at=CASE WHEN saldo_banco IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END WHERE conta_id=OLD.conta_id;
END;
CREATE TRIGGER workflow_extrato_saldo_update AFTER UPDATE ON workflow_extrato BEGIN
 UPDATE workflow_saldos SET saldo_sistema=saldo_sistema-OLD.valor,updated_at=CASE WHEN saldo_banco IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END WHERE conta_id=OLD.conta_id;
 UPDATE workflow_saldos SET saldo_sistema=saldo_sistema+NEW.valor,updated_at=CASE WHEN saldo_banco IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END WHERE conta_id=NEW.conta_id;
END;
