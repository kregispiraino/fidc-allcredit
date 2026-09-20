-- Qprof is a lookup source. Each transfer owns independent composition snapshots.
DROP VIEW workflow_rastreio_titulos;
DROP TRIGGER workflow_rastreio_transferencia_valida;
DROP TRIGGER workflow_extrato_vinculos;
DROP TRIGGER importacao_qprof_titulos_vinculos;
DROP TRIGGER importacao_qprof_titulos_insert_vinculos;
DROP TRIGGER importacao_qprof_titulos_exclusao;
DROP TRIGGER workflow_rastreio_transferencia_imutavel;
CREATE TEMP TABLE extrato_anterior AS SELECT * FROM workflow_extrato;
CREATE TEMP TABLE titulos_anteriores AS SELECT * FROM importacao_qprof_titulos;
CREATE TEMP TABLE transferencias_anteriores AS SELECT * FROM workflow_rastreio_transferencias;
-- Break the old circular links after copying them, without disabling foreign keys.
UPDATE workflow_extrato SET rastreio_conciliacao_id=NULL,rastreio_liquidacao_id=NULL;
UPDATE importacao_qprof_titulos SET rastreio_conciliacao_id=NULL,rastreio_liquidacao_id=NULL;
DROP TABLE workflow_rastreio_transferencias;
DROP TABLE workflow_extrato;
DROP TABLE importacao_qprof_titulos;
CREATE TABLE workflow_extrato (
 id INTEGER PRIMARY KEY,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reconciled','reversal')),
 data TEXT NOT NULL CHECK(data GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 entidade_id INTEGER REFERENCES gerenciador_entidades(id) ON DELETE RESTRICT,
 natureza_id INTEGER REFERENCES gerenciador_naturezas(id) ON DELETE RESTRICT,
 historico TEXT NOT NULL,
 valor INTEGER NOT NULL CHECK(valor != 0 AND abs(valor)<=9000000000000),
 conta_id INTEGER NOT NULL REFERENCES gerenciador_contas(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
INSERT INTO workflow_extrato SELECT id,status,data,entidade_id,natureza_id,historico,valor,conta_id,created_at,updated_at FROM extrato_anterior;
CREATE INDEX workflow_extrato_fila ON workflow_extrato(conta_id,status,data);
CREATE TABLE importacao_qprof_titulos (
 id INTEGER PRIMARY KEY, numero TEXT NOT NULL UNIQUE, cedente TEXT NOT NULL DEFAULT '',
 sacado TEXT NOT NULL, documento TEXT, vencimento TEXT NOT NULL, pagamento TEXT,
 valor INTEGER NOT NULL CHECK(valor>0 AND valor<=9000000000000),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
INSERT INTO importacao_qprof_titulos(id,numero,sacado,documento,vencimento,pagamento,valor,created_at,updated_at)
 SELECT id,numero,sacado,documento,vencimento,pagamento,valor,created_at,updated_at FROM titulos_anteriores;
CREATE TABLE workflow_rastreio_transferencias (
 id INTEGER PRIMARY KEY,
 extrato_id INTEGER NOT NULL UNIQUE REFERENCES workflow_extrato(id) ON DELETE CASCADE,
 versao INTEGER NOT NULL DEFAULT 1 CHECK(versao>0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
INSERT INTO workflow_rastreio_transferencias(id,extrato_id,created_at,updated_at)
 SELECT id,extrato_id,created_at,updated_at FROM transferencias_anteriores;
CREATE TABLE workflow_rastreio_itens (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 transferencia_id INTEGER NOT NULL REFERENCES workflow_rastreio_transferencias(id) ON DELETE CASCADE,
 qprof_titulo_id INTEGER REFERENCES importacao_qprof_titulos(id) ON DELETE SET NULL,
 tipo TEXT NOT NULL CHECK(tipo IN ('titulo','parcial','tarifa','custas')),
 titulo TEXT NOT NULL DEFAULT '', cedente TEXT NOT NULL DEFAULT '', sacado TEXT NOT NULL DEFAULT '',
 valor INTEGER NOT NULL CHECK(valor!=0 AND abs(valor)<=9000000000000),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
INSERT INTO workflow_rastreio_itens(transferencia_id,qprof_titulo_id,tipo,titulo,sacado,valor,created_at,updated_at)
 SELECT tr.id,t.id,'titulo',t.numero,t.sacado,t.valor,tr.created_at,tr.updated_at
 FROM titulos_anteriores t JOIN transferencias_anteriores tr
 ON (tr.tipo='conciliacao' AND t.rastreio_conciliacao_id=tr.id) OR (tr.tipo='liquidacao' AND t.rastreio_liquidacao_id=tr.id)
 ORDER BY tr.id,t.id;
CREATE INDEX workflow_rastreio_itens_transferencia ON workflow_rastreio_itens(transferencia_id);
CREATE INDEX workflow_rastreio_itens_qprof ON workflow_rastreio_itens(qprof_titulo_id);
-- Metadata is always read from Extrato. Bump the composition version on changes
-- so an operator cannot unknowingly save against an outdated transfer amount.
CREATE TRIGGER workflow_extrato_atualiza_rastreio AFTER UPDATE ON workflow_extrato BEGIN
 UPDATE workflow_rastreio_transferencias SET versao=versao+1,updated_at=CURRENT_TIMESTAMP WHERE extrato_id=NEW.id;
END;
DROP TABLE extrato_anterior;
DROP TABLE titulos_anteriores;
DROP TABLE transferencias_anteriores;
