CREATE TABLE gerenciador_naturezas (
 id INTEGER PRIMARY KEY, nome TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(nome)) BETWEEN 1 AND 160),
 classificacao TEXT NOT NULL CHECK(length(trim(classificacao)) BETWEEN 1 AND 120),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE TABLE gerenciador_entidades (
 id INTEGER PRIMARY KEY, nome TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(nome)) BETWEEN 1 AND 160),
 classificacao TEXT NOT NULL CHECK(length(trim(classificacao)) BETWEEN 1 AND 120),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE TABLE gerenciador_contas (
 id INTEGER PRIMARY KEY, nome TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(nome)) BETWEEN 1 AND 160),
 funcao TEXT NOT NULL CHECK(funcao IN ('conciliacao','liquidacao','operacional')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE TABLE gerenciador_configuracoes (
 id INTEGER PRIMARY KEY CHECK(id=1),
 conta_conciliacao_id INTEGER REFERENCES gerenciador_contas(id) ON DELETE RESTRICT,
 conta_liquidacao_id INTEGER REFERENCES gerenciador_contas(id) ON DELETE RESTRICT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
INSERT INTO gerenciador_configuracoes(id) VALUES(1);
CREATE TABLE workflow_extrato (
 id INTEGER PRIMARY KEY,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reconciled','reversal')),
 data TEXT NOT NULL CHECK(data GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 entidade_id INTEGER REFERENCES gerenciador_entidades(id) ON DELETE RESTRICT,
 natureza_id INTEGER REFERENCES gerenciador_naturezas(id) ON DELETE RESTRICT,
 historico TEXT NOT NULL,
 valor INTEGER NOT NULL CHECK(valor != 0 AND abs(valor)<=9000000000000),
 conta_id INTEGER NOT NULL REFERENCES gerenciador_contas(id) ON DELETE RESTRICT,
 id_conciliacao INTEGER UNIQUE REFERENCES workflow_transferencias(id) ON DELETE RESTRICT,
 id_liquidacao INTEGER UNIQUE REFERENCES workflow_transferencias(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(id_conciliacao IS NULL OR (valor>0 AND status='reconciled')),
 CHECK(id_liquidacao IS NULL OR (valor<0 AND status='reconciled')),
 CHECK(id_conciliacao IS NULL OR id_liquidacao IS NULL)
) STRICT;
CREATE TABLE workflow_transferencias (
 id INTEGER PRIMARY KEY,
 extrato_id INTEGER NOT NULL UNIQUE REFERENCES workflow_extrato(id) ON DELETE RESTRICT,
 tipo TEXT NOT NULL CHECK(tipo IN ('conciliacao','liquidacao')),
 valor INTEGER NOT NULL CHECK(valor>0 AND valor<=9000000000000),
 data TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE TABLE workflow_titulos (
 id INTEGER PRIMARY KEY, numero TEXT NOT NULL UNIQUE, sacado TEXT NOT NULL, documento TEXT,
 vencimento TEXT NOT NULL, pagamento TEXT,
 valor INTEGER NOT NULL CHECK(valor>0 AND valor<=9000000000000),
 id_conciliacao INTEGER REFERENCES workflow_transferencias(id) ON DELETE RESTRICT,
 id_liquidacao INTEGER REFERENCES workflow_transferencias(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE INDEX workflow_extrato_fila ON workflow_extrato(conta_id,status,data);
CREATE INDEX workflow_titulos_conciliacao ON workflow_titulos(id_conciliacao);
CREATE INDEX workflow_titulos_liquidacao ON workflow_titulos(id_liquidacao);
CREATE TRIGGER workflow_transferencia_valida BEFORE INSERT ON workflow_transferencias BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM workflow_extrato e WHERE e.id=NEW.extrato_id
  AND e.status!='reversal' AND e.id_conciliacao IS NULL AND e.id_liquidacao IS NULL
  AND abs(e.valor)=NEW.valor AND e.data=NEW.data
  AND ((NEW.tipo='conciliacao' AND e.valor>0) OR (NEW.tipo='liquidacao' AND e.valor<0)))
 THEN RAISE(ABORT,'Transferência incompatível com o extrato') END;
END;
CREATE TRIGGER workflow_extrato_vinculos BEFORE UPDATE ON workflow_extrato BEGIN
 SELECT CASE WHEN NEW.id_conciliacao IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workflow_transferencias WHERE id=NEW.id_conciliacao AND tipo='conciliacao' AND extrato_id=NEW.id)
 THEN RAISE(ABORT,'Conciliação incompatível com o extrato') END;
 SELECT CASE WHEN NEW.id_liquidacao IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workflow_transferencias WHERE id=NEW.id_liquidacao AND tipo='liquidacao' AND extrato_id=NEW.id)
 THEN RAISE(ABORT,'Liquidação incompatível com o extrato') END;
 SELECT CASE WHEN (OLD.id_conciliacao IS NOT NULL OR OLD.id_liquidacao IS NOT NULL) AND
 (NEW.valor!=OLD.valor OR NEW.data!=OLD.data OR NEW.conta_id!=OLD.conta_id OR NEW.id_conciliacao IS NOT OLD.id_conciliacao OR NEW.id_liquidacao IS NOT OLD.id_liquidacao)
 THEN RAISE(ABORT,'Movimentação lastreada não pode ser alterada') END;
END;
CREATE TRIGGER workflow_titulos_vinculos BEFORE UPDATE ON workflow_titulos BEGIN
 SELECT CASE WHEN NEW.id_conciliacao IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workflow_transferencias WHERE id=NEW.id_conciliacao AND tipo='conciliacao')
 THEN RAISE(ABORT,'Referência de conciliação inválida') END;
 SELECT CASE WHEN NEW.id_liquidacao IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workflow_transferencias WHERE id=NEW.id_liquidacao AND tipo='liquidacao')
 THEN RAISE(ABORT,'Referência de liquidação inválida') END;
 SELECT CASE WHEN (OLD.id_conciliacao IS NOT NULL AND NEW.id_conciliacao IS NOT OLD.id_conciliacao)
 OR (OLD.id_liquidacao IS NOT NULL AND NEW.id_liquidacao IS NOT OLD.id_liquidacao)
 OR ((OLD.id_conciliacao IS NOT NULL OR OLD.id_liquidacao IS NOT NULL) AND NEW.valor!=OLD.valor)
 THEN RAISE(ABORT,'Título já lastreado nesta etapa') END;
END;
CREATE TRIGGER workflow_titulos_insert_vinculos BEFORE INSERT ON workflow_titulos BEGIN
 SELECT CASE WHEN NEW.id_conciliacao IS NOT NULL OR NEW.id_liquidacao IS NOT NULL
 THEN RAISE(ABORT,'Cadastre o título antes de confirmar o lastro') END;
END;
CREATE TRIGGER workflow_titulos_exclusao BEFORE DELETE ON workflow_titulos WHEN OLD.id_conciliacao IS NOT NULL OR OLD.id_liquidacao IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'Título lastreado não pode ser excluído');
END;
CREATE TRIGGER workflow_transferencia_imutavel BEFORE UPDATE ON workflow_transferencias BEGIN
 SELECT RAISE(ABORT,'Transferência confirmada não pode ser alterada');
END;
CREATE VIEW workflow_rastreio_titulos AS SELECT t.*, c.extrato_id AS extrato_entrada_id,
 c.data AS data_entrada, l.extrato_id AS extrato_saida_id, l.data AS data_saida,
 CASE WHEN c.data IS NOT NULL THEN CAST(julianday(COALESCE(l.data,date('now')))-julianday(c.data) AS INTEGER) END AS dias_na_conta
 FROM workflow_titulos t LEFT JOIN workflow_transferencias c ON c.id=t.id_conciliacao
 LEFT JOIN workflow_transferencias l ON l.id=t.id_liquidacao;
