-- Keep the catalog and its IDs; only the current imported selection is searchable.
ALTER TABLE importacao_qprof_titulos ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1));
CREATE INDEX importacao_qprof_ativos_data ON importacao_qprof_titulos(ativo,data_liquidacao,id);
CREATE INDEX workflow_rastreio_itens_compensacao ON workflow_rastreio_itens(compensa_registro_id) WHERE efeito='compensacao';
