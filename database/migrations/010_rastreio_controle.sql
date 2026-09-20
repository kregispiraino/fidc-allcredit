-- rebuild-referenced-tables
DROP TRIGGER workflow_extrato_atualiza_rastreio;
-- Persistent economic items are independent of the replaceable Qprof lookup base.
CREATE TABLE workflow_rastreio_configuracoes(id INTEGER PRIMARY KEY CHECK(id=1),inicio_controle TEXT) STRICT;
INSERT INTO workflow_rastreio_configuracoes(id) VALUES(1);
CREATE TABLE workflow_rastreio_importacoes(chave TEXT PRIMARY KEY,arquivo TEXT NOT NULL,sha256 TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT;
ALTER TABLE workflow_extrato ADD COLUMN rastreio_condicao TEXT NOT NULL DEFAULT 'aplicavel' CHECK(rastreio_condicao IN ('aplicavel','legado_sem_rastreio'));
CREATE TABLE workflow_rastreio_sequencias(data TEXT PRIMARY KEY,ultimo INTEGER NOT NULL CHECK(ultimo>0)) STRICT;
CREATE TABLE workflow_rastreio_transferencias_novas (
 id INTEGER PRIMARY KEY, extrato_id INTEGER UNIQUE REFERENCES workflow_extrato(id) ON DELETE CASCADE,
 versao INTEGER NOT NULL DEFAULT 1 CHECK(versao>0),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 codigo TEXT UNIQUE, origem_chave TEXT UNIQUE,
 conta_origem_id INTEGER REFERENCES gerenciador_contas(id) ON DELETE RESTRICT,
 data_origem TEXT,descricao_origem TEXT,documento TEXT,valor_origem INTEGER,direcao_origem TEXT,
 composicao_origem INTEGER,diferenca_origem INTEGER,status_origem TEXT,observacao TEXT,
 revisado_em TEXT,
 CHECK(extrato_id IS NOT NULL OR (conta_origem_id IS NOT NULL AND data_origem IS NOT NULL AND valor_origem IS NOT NULL)),
 CHECK(codigo IS NULL OR (codigo GLOB 'TRF-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9]*' AND substr(codigo,14) NOT GLOB '*[^0-9]*'))
) STRICT;
INSERT INTO workflow_rastreio_transferencias_novas(id,extrato_id,versao,created_at,updated_at,codigo)
 SELECT tr.id,tr.extrato_id,tr.versao,tr.created_at,tr.updated_at,'TRF-'||replace(e.data,'-','')||'-'||printf('%02d',row_number() OVER(PARTITION BY e.data ORDER BY tr.id))
 FROM workflow_rastreio_transferencias tr JOIN workflow_extrato e ON e.id=tr.extrato_id;
DROP TABLE workflow_rastreio_transferencias;
ALTER TABLE workflow_rastreio_transferencias_novas RENAME TO workflow_rastreio_transferencias;
INSERT INTO workflow_rastreio_sequencias(data,ultimo) SELECT e.data,count(*) FROM workflow_rastreio_transferencias tr JOIN workflow_extrato e ON e.id=tr.extrato_id GROUP BY e.data;
CREATE TRIGGER workflow_rastreio_codigo_automatico AFTER INSERT ON workflow_rastreio_transferencias WHEN NEW.codigo IS NULL BEGIN
 INSERT INTO workflow_rastreio_sequencias(data,ultimo) VALUES(COALESCE((SELECT data FROM workflow_extrato WHERE id=NEW.extrato_id),NEW.data_origem),1)
 ON CONFLICT(data) DO UPDATE SET ultimo=ultimo+1;
 UPDATE workflow_rastreio_transferencias SET codigo='TRF-'||replace(COALESCE((SELECT data FROM workflow_extrato WHERE id=NEW.extrato_id),NEW.data_origem),'-','')||'-'||
 printf('%02d',(SELECT ultimo FROM workflow_rastreio_sequencias WHERE data=COALESCE((SELECT data FROM workflow_extrato WHERE id=NEW.extrato_id),NEW.data_origem))) WHERE id=NEW.id;
END;
CREATE TRIGGER workflow_rastreio_codigo_reserva AFTER INSERT ON workflow_rastreio_transferencias WHEN NEW.codigo IS NOT NULL BEGIN
 INSERT INTO workflow_rastreio_sequencias(data,ultimo) VALUES(substr(NEW.codigo,5,4)||'-'||substr(NEW.codigo,9,2)||'-'||substr(NEW.codigo,11,2),CAST(substr(NEW.codigo,14) AS INTEGER))
 ON CONFLICT(data) DO UPDATE SET ultimo=max(ultimo,excluded.ultimo);
END;
CREATE TRIGGER workflow_rastreio_codigo_imutavel BEFORE UPDATE OF codigo ON workflow_rastreio_transferencias WHEN OLD.codigo IS NOT NULL AND NEW.codigo IS NOT OLD.codigo BEGIN
 SELECT RAISE(ABORT,'O código da transferência é persistente.');
END;
CREATE TABLE workflow_rastreio_registros (
 id INTEGER PRIMARY KEY AUTOINCREMENT,origem_chave TEXT UNIQUE,
 tipo TEXT NOT NULL CHECK(tipo IN ('titulo','parcial','tarifa','custas','ajuste_saldo','recebimento_sem_titulo','devolucao_ajuste','divergencia')),
 titulo TEXT NOT NULL DEFAULT '',cedente TEXT NOT NULL DEFAULT '',sacado TEXT NOT NULL DEFAULT '',
 codigo_cedente TEXT,codigo_sacado TEXT,
 cedente_id INTEGER REFERENCES gerenciador_entidades(id) ON DELETE SET NULL,sacado_id INTEGER REFERENCES gerenciador_entidades(id) ON DELETE SET NULL,
 valor INTEGER NOT NULL,data_liquidacao TEXT,recebimentos TEXT,data_recebimento TEXT,saldo_origem INTEGER,
 status_origem TEXT,observacao TEXT,revisado_em TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE TABLE workflow_rastreio_itens_novos (
 id INTEGER PRIMARY KEY AUTOINCREMENT,transferencia_id INTEGER NOT NULL REFERENCES workflow_rastreio_transferencias(id) ON DELETE CASCADE,
 qprof_titulo_id INTEGER REFERENCES importacao_qprof_titulos(id) ON DELETE SET NULL,
 tipo TEXT NOT NULL CHECK(tipo IN ('titulo','parcial','tarifa','custas','ajuste_saldo','recebimento_sem_titulo','devolucao_ajuste','divergencia')),
 titulo TEXT NOT NULL DEFAULT '',cedente TEXT NOT NULL DEFAULT '',sacado TEXT NOT NULL DEFAULT '',
 valor INTEGER CHECK(valor IS NULL OR abs(valor)<=9000000000000),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 data_liquidacao TEXT,carteira TEXT NOT NULL DEFAULT '',carteira_interna TEXT NOT NULL DEFAULT '',
 registro_id INTEGER REFERENCES workflow_rastreio_registros(id) ON DELETE RESTRICT,
 origem_posicao TEXT CHECK(origem_posicao IN ('credito','debito_1','debito_2')),
 valor_alocado_origem INTEGER,data_alocacao_origem TEXT,
 UNIQUE(registro_id,transferencia_id,origem_posicao)
) STRICT;
INSERT INTO workflow_rastreio_itens_novos(id,transferencia_id,qprof_titulo_id,tipo,titulo,cedente,sacado,valor,created_at,updated_at,data_liquidacao,carteira,carteira_interna)
 SELECT id,transferencia_id,qprof_titulo_id,tipo,titulo,cedente,sacado,valor,created_at,updated_at,data_liquidacao,carteira,carteira_interna FROM workflow_rastreio_itens;
DROP TABLE workflow_rastreio_itens;
ALTER TABLE workflow_rastreio_itens_novos RENAME TO workflow_rastreio_itens;
CREATE INDEX workflow_rastreio_itens_transferencia ON workflow_rastreio_itens(transferencia_id);
CREATE INDEX workflow_rastreio_itens_qprof ON workflow_rastreio_itens(qprof_titulo_id);
CREATE INDEX workflow_rastreio_itens_registro ON workflow_rastreio_itens(registro_id);
CREATE INDEX workflow_rastreio_registros_titulo ON workflow_rastreio_registros(titulo,cedente,sacado);
-- Tracking flags must not change financial balances or the composition's concurrency version.
CREATE TRIGGER workflow_extrato_atualiza_rastreio AFTER UPDATE OF data,historico,status,valor,valor_subcentavos,conta_id,entidade_id,natureza_id ON workflow_extrato BEGIN
 UPDATE workflow_rastreio_transferencias SET versao=versao+1,updated_at=CURRENT_TIMESTAMP WHERE extrato_id=NEW.id;
END;
DROP TRIGGER workflow_extrato_saldo_update;
CREATE TRIGGER workflow_extrato_saldo_update AFTER UPDATE OF valor,valor_subcentavos,conta_id ON workflow_extrato BEGIN
 UPDATE workflow_saldos SET saldo_sistema=(saldo_sistema*100+saldo_sistema_subcentavos-(OLD.valor*100+OLD.valor_subcentavos))/100,saldo_sistema_subcentavos=(saldo_sistema*100+saldo_sistema_subcentavos-(OLD.valor*100+OLD.valor_subcentavos))%100,
 updated_at=CASE WHEN saldo_banco IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END WHERE conta_id=OLD.conta_id;
 UPDATE workflow_saldos SET saldo_sistema=(saldo_sistema*100+saldo_sistema_subcentavos+(NEW.valor*100+NEW.valor_subcentavos))/100,saldo_sistema_subcentavos=(saldo_sistema*100+saldo_sistema_subcentavos+(NEW.valor*100+NEW.valor_subcentavos))%100,
 updated_at=CASE WHEN saldo_banco IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END WHERE conta_id=NEW.conta_id;
END;
CREATE TRIGGER workflow_extrato_rastreio_insert AFTER INSERT ON workflow_extrato BEGIN
 UPDATE workflow_extrato SET rastreio_condicao=CASE WHEN NEW.data<(SELECT inicio_controle FROM workflow_rastreio_configuracoes WHERE id=1) AND (SELECT funcao FROM gerenciador_contas WHERE id=NEW.conta_id)='rastreada' THEN 'legado_sem_rastreio' ELSE 'aplicavel' END WHERE id=NEW.id;
END;
CREATE TRIGGER workflow_extrato_rastreio_update AFTER UPDATE OF data,conta_id ON workflow_extrato BEGIN
 UPDATE workflow_extrato SET rastreio_condicao=CASE WHEN NEW.data<(SELECT inicio_controle FROM workflow_rastreio_configuracoes WHERE id=1) AND (SELECT funcao FROM gerenciador_contas WHERE id=NEW.conta_id)='rastreada' THEN 'legado_sem_rastreio' ELSE 'aplicavel' END WHERE id=NEW.id;
END;
CREATE TRIGGER gerenciador_contas_rastreio_update AFTER UPDATE OF funcao ON gerenciador_contas BEGIN
 UPDATE workflow_extrato SET rastreio_condicao=CASE WHEN data<(SELECT inicio_controle FROM workflow_rastreio_configuracoes WHERE id=1) AND NEW.funcao='rastreada' THEN 'legado_sem_rastreio' ELSE 'aplicavel' END WHERE conta_id=NEW.id;
END;
