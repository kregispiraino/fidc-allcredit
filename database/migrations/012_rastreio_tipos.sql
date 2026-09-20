-- rebuild-referenced-tables
-- Normalize operational types; original categories remain provenance only.
UPDATE workflow_rastreio_transferencias SET versao=versao+1,updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT transferencia_id FROM workflow_rastreio_itens WHERE tipo NOT IN ('titulo','parcial','tarifa','custas'));
CREATE TABLE workflow_rastreio_registros_novos (
 id INTEGER PRIMARY KEY AUTOINCREMENT,origem_chave TEXT UNIQUE,
 tipo TEXT NOT NULL CHECK(tipo IN ('titulo','parcial','tarifa','custas','ajuste')),
 titulo TEXT NOT NULL DEFAULT '',cedente TEXT NOT NULL DEFAULT '',sacado TEXT NOT NULL DEFAULT '',
 codigo_cedente TEXT,codigo_sacado TEXT,
 cedente_id INTEGER REFERENCES gerenciador_entidades(id) ON DELETE SET NULL,sacado_id INTEGER REFERENCES gerenciador_entidades(id) ON DELETE SET NULL,
 valor INTEGER NOT NULL,data_liquidacao TEXT,recebimentos TEXT,data_recebimento TEXT,saldo_origem INTEGER,
 status_origem TEXT,observacao TEXT,revisado_em TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, observacao_revisao TEXT, tipo_origem TEXT, debito_origem TEXT, pendencia_dispensa TEXT
) STRICT;
INSERT INTO workflow_rastreio_registros_novos(id,origem_chave,tipo,titulo,cedente,sacado,codigo_cedente,codigo_sacado,cedente_id,sacado_id,valor,data_liquidacao,recebimentos,data_recebimento,saldo_origem,status_origem,observacao,revisado_em,created_at,updated_at,observacao_revisao,tipo_origem) SELECT id,origem_chave,CASE WHEN tipo IN ('titulo','parcial','tarifa','custas') THEN tipo ELSE 'ajuste' END,titulo,cedente,sacado,codigo_cedente,codigo_sacado,cedente_id,sacado_id,valor,data_liquidacao,recebimentos,data_recebimento,saldo_origem,status_origem,observacao,revisado_em,created_at,updated_at,observacao_revisao,tipo FROM workflow_rastreio_registros;
UPDATE sqlite_sequence SET seq=max(seq,COALESCE((SELECT seq FROM sqlite_sequence WHERE name='workflow_rastreio_registros'),0)) WHERE name='workflow_rastreio_registros_novos';
INSERT INTO sqlite_sequence(name,seq) SELECT 'workflow_rastreio_registros_novos',seq FROM sqlite_sequence WHERE name='workflow_rastreio_registros' AND NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='workflow_rastreio_registros_novos');
DROP TABLE workflow_rastreio_registros;
ALTER TABLE workflow_rastreio_registros_novos RENAME TO workflow_rastreio_registros;
CREATE TABLE workflow_rastreio_itens_novos (
 id INTEGER PRIMARY KEY AUTOINCREMENT,transferencia_id INTEGER NOT NULL REFERENCES workflow_rastreio_transferencias(id) ON DELETE CASCADE,
 qprof_titulo_id INTEGER REFERENCES importacao_qprof_titulos(id) ON DELETE SET NULL,
 tipo TEXT NOT NULL CHECK(tipo IN ('titulo','parcial','tarifa','custas','ajuste')),
 titulo TEXT NOT NULL DEFAULT '',cedente TEXT NOT NULL DEFAULT '',sacado TEXT NOT NULL DEFAULT '',
 valor INTEGER CHECK(valor IS NULL OR abs(valor)<=9000000000000),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 data_liquidacao TEXT,carteira TEXT NOT NULL DEFAULT '',carteira_interna TEXT NOT NULL DEFAULT '',
 registro_id INTEGER REFERENCES workflow_rastreio_registros(id) ON DELETE RESTRICT,
 origem_posicao TEXT CHECK(origem_posicao IN ('credito','debito_1','debito_2')),
 valor_alocado_origem INTEGER,data_alocacao_origem TEXT, efeito TEXT NOT NULL DEFAULT 'composicao' CHECK(efeito IN ('composicao','compensacao')), compensa_registro_id INTEGER REFERENCES workflow_rastreio_registros(id) ON DELETE RESTRICT
 CHECK((efeito='composicao' AND compensa_registro_id IS NULL) OR (efeito='compensacao' AND compensa_registro_id IS NOT NULL)),
 tipo_origem TEXT,
 UNIQUE(registro_id,transferencia_id,origem_posicao)
) STRICT;
INSERT INTO workflow_rastreio_itens_novos(id,transferencia_id,qprof_titulo_id,tipo,titulo,cedente,sacado,valor,created_at,updated_at,data_liquidacao,carteira,carteira_interna,registro_id,origem_posicao,valor_alocado_origem,data_alocacao_origem,efeito,compensa_registro_id,tipo_origem) SELECT id,transferencia_id,qprof_titulo_id,CASE WHEN tipo IN ('titulo','parcial','tarifa','custas') THEN tipo ELSE 'ajuste' END,titulo,cedente,sacado,valor,created_at,updated_at,data_liquidacao,carteira,carteira_interna,registro_id,origem_posicao,valor_alocado_origem,data_alocacao_origem,efeito,compensa_registro_id,tipo FROM workflow_rastreio_itens;
UPDATE sqlite_sequence SET seq=max(seq,COALESCE((SELECT seq FROM sqlite_sequence WHERE name='workflow_rastreio_itens'),0)) WHERE name='workflow_rastreio_itens_novos';
INSERT INTO sqlite_sequence(name,seq) SELECT 'workflow_rastreio_itens_novos',seq FROM sqlite_sequence WHERE name='workflow_rastreio_itens' AND NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='workflow_rastreio_itens_novos');
DROP TABLE workflow_rastreio_itens;
ALTER TABLE workflow_rastreio_itens_novos RENAME TO workflow_rastreio_itens;
CREATE INDEX workflow_rastreio_registros_titulo ON workflow_rastreio_registros(titulo,cedente,sacado);
CREATE INDEX workflow_rastreio_itens_transferencia ON workflow_rastreio_itens(transferencia_id);
CREATE INDEX workflow_rastreio_itens_qprof ON workflow_rastreio_itens(qprof_titulo_id);
CREATE INDEX workflow_rastreio_itens_registro ON workflow_rastreio_itens(registro_id);
