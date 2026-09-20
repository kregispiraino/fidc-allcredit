-- rebuild-referenced-tables
-- Optional classification and exact 1/10,000 BRL precision without floating-point storage.
CREATE TABLE gerenciador_naturezas_nova (
 id INTEGER PRIMARY KEY, nome TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(nome)) BETWEEN 1 AND 160),
 classificacao TEXT NOT NULL DEFAULT '' CHECK(length(trim(classificacao))<=120),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
INSERT INTO gerenciador_naturezas_nova SELECT * FROM gerenciador_naturezas;
DROP TABLE gerenciador_naturezas;
ALTER TABLE gerenciador_naturezas_nova RENAME TO gerenciador_naturezas;
CREATE TABLE gerenciador_entidades_nova (
 id INTEGER PRIMARY KEY, nome TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(nome)) BETWEEN 1 AND 160),
 classificacao TEXT NOT NULL DEFAULT '' CHECK(length(trim(classificacao))<=120),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
INSERT INTO gerenciador_entidades_nova SELECT * FROM gerenciador_entidades;
DROP TABLE gerenciador_entidades;
ALTER TABLE gerenciador_entidades_nova RENAME TO gerenciador_entidades;
CREATE TABLE workflow_extrato_novo (
 id INTEGER PRIMARY KEY,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reconciled','reversal')),
 data TEXT NOT NULL CHECK(data GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 entidade_id INTEGER REFERENCES gerenciador_entidades(id) ON DELETE RESTRICT,
 natureza_id INTEGER REFERENCES gerenciador_naturezas(id) ON DELETE RESTRICT,
 historico TEXT NOT NULL,
 valor INTEGER NOT NULL CHECK(abs(valor)<=9000000000000),
 conta_id INTEGER NOT NULL REFERENCES gerenciador_contas(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 valor_subcentavos INTEGER NOT NULL DEFAULT 0 CHECK(abs(valor_subcentavos)<100),
 CHECK(valor!=0 OR valor_subcentavos!=0),
 CHECK(valor=0 OR valor_subcentavos=0 OR (valor>0)=(valor_subcentavos>0)),
 CHECK(abs(valor*100+valor_subcentavos)<=900000000000000)
) STRICT;
INSERT INTO workflow_extrato_novo(id,status,data,entidade_id,natureza_id,historico,valor,conta_id,created_at,updated_at)
 SELECT id,status,data,entidade_id,natureza_id,historico,valor,conta_id,created_at,updated_at FROM workflow_extrato;
DROP TABLE workflow_extrato;
ALTER TABLE workflow_extrato_novo RENAME TO workflow_extrato;
CREATE INDEX workflow_extrato_fila ON workflow_extrato(conta_id,status,data);
ALTER TABLE workflow_saldos ADD COLUMN saldo_sistema_subcentavos INTEGER NOT NULL DEFAULT 0 CHECK(abs(saldo_sistema_subcentavos)<100);
CREATE TRIGGER workflow_extrato_atualiza_rastreio AFTER UPDATE ON workflow_extrato BEGIN
 UPDATE workflow_rastreio_transferencias SET versao=versao+1,updated_at=CURRENT_TIMESTAMP WHERE extrato_id=NEW.id;
END;
CREATE TRIGGER workflow_extrato_saldo_insert AFTER INSERT ON workflow_extrato BEGIN
 UPDATE workflow_saldos SET saldo_sistema=(saldo_sistema*100+saldo_sistema_subcentavos+(NEW.valor*100+NEW.valor_subcentavos))/100,saldo_sistema_subcentavos=(saldo_sistema*100+saldo_sistema_subcentavos+(NEW.valor*100+NEW.valor_subcentavos))%100,
  updated_at=CASE WHEN saldo_banco IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END WHERE conta_id=NEW.conta_id;
END;
CREATE TRIGGER workflow_extrato_saldo_delete AFTER DELETE ON workflow_extrato BEGIN
 UPDATE workflow_saldos SET saldo_sistema=(saldo_sistema*100+saldo_sistema_subcentavos-(OLD.valor*100+OLD.valor_subcentavos))/100,saldo_sistema_subcentavos=(saldo_sistema*100+saldo_sistema_subcentavos-(OLD.valor*100+OLD.valor_subcentavos))%100,
  updated_at=CASE WHEN saldo_banco IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END WHERE conta_id=OLD.conta_id;
END;
CREATE TRIGGER workflow_extrato_saldo_update AFTER UPDATE ON workflow_extrato BEGIN
 UPDATE workflow_saldos SET saldo_sistema=(saldo_sistema*100+saldo_sistema_subcentavos-(OLD.valor*100+OLD.valor_subcentavos))/100,saldo_sistema_subcentavos=(saldo_sistema*100+saldo_sistema_subcentavos-(OLD.valor*100+OLD.valor_subcentavos))%100,
  updated_at=CASE WHEN saldo_banco IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END WHERE conta_id=OLD.conta_id;
 UPDATE workflow_saldos SET saldo_sistema=(saldo_sistema*100+saldo_sistema_subcentavos+(NEW.valor*100+NEW.valor_subcentavos))/100,saldo_sistema_subcentavos=(saldo_sistema*100+saldo_sistema_subcentavos+(NEW.valor*100+NEW.valor_subcentavos))%100,
  updated_at=CASE WHEN saldo_banco IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END WHERE conta_id=NEW.conta_id;
END;
