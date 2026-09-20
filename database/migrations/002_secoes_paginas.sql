-- Additive migration: preserve IDs, audit timestamps, amounts and both trace links.
-- 001 remains immutable because it has already been applied to existing databases.
DROP VIEW workflow_rastreio_titulos;
DROP TRIGGER workflow_transferencia_valida;
DROP TRIGGER workflow_extrato_vinculos;
DROP TRIGGER workflow_titulos_vinculos;
DROP TRIGGER workflow_titulos_insert_vinculos;
DROP TRIGGER workflow_titulos_exclusao;
DROP TRIGGER workflow_transferencia_imutavel;
DROP INDEX workflow_titulos_conciliacao;
DROP INDEX workflow_titulos_liquidacao;
ALTER TABLE workflow_transferencias RENAME TO workflow_rastreio_transferencias;
ALTER TABLE workflow_titulos RENAME TO importacao_qprof_titulos;
ALTER TABLE gerenciador_configuracoes RENAME TO gerenciador_contas_configuracoes;
ALTER TABLE workflow_extrato RENAME COLUMN id_conciliacao TO rastreio_conciliacao_id;
ALTER TABLE workflow_extrato RENAME COLUMN id_liquidacao TO rastreio_liquidacao_id;
ALTER TABLE importacao_qprof_titulos RENAME COLUMN id_conciliacao TO rastreio_conciliacao_id;
ALTER TABLE importacao_qprof_titulos RENAME COLUMN id_liquidacao TO rastreio_liquidacao_id;
CREATE INDEX importacao_qprof_titulos_conciliacao ON importacao_qprof_titulos(rastreio_conciliacao_id);
CREATE INDEX importacao_qprof_titulos_liquidacao ON importacao_qprof_titulos(rastreio_liquidacao_id);
CREATE TRIGGER workflow_rastreio_transferencia_valida BEFORE INSERT ON workflow_rastreio_transferencias BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM workflow_extrato e WHERE e.id=NEW.extrato_id
  AND e.status!='reversal' AND e.rastreio_conciliacao_id IS NULL AND e.rastreio_liquidacao_id IS NULL
  AND abs(e.valor)=NEW.valor AND e.data=NEW.data
  AND ((NEW.tipo='conciliacao' AND e.valor>0) OR (NEW.tipo='liquidacao' AND e.valor<0)))
 THEN RAISE(ABORT,'Transferência incompatível com o extrato') END;
END;
CREATE TRIGGER workflow_extrato_vinculos BEFORE UPDATE ON workflow_extrato BEGIN
 SELECT CASE WHEN NEW.rastreio_conciliacao_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workflow_rastreio_transferencias WHERE id=NEW.rastreio_conciliacao_id AND tipo='conciliacao' AND extrato_id=NEW.id)
 THEN RAISE(ABORT,'Conciliação incompatível com o extrato') END;
 SELECT CASE WHEN NEW.rastreio_liquidacao_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workflow_rastreio_transferencias WHERE id=NEW.rastreio_liquidacao_id AND tipo='liquidacao' AND extrato_id=NEW.id)
 THEN RAISE(ABORT,'Liquidação incompatível com o extrato') END;
 SELECT CASE WHEN (OLD.rastreio_conciliacao_id IS NOT NULL OR OLD.rastreio_liquidacao_id IS NOT NULL) AND
 (NEW.valor!=OLD.valor OR NEW.data!=OLD.data OR NEW.conta_id!=OLD.conta_id OR NEW.rastreio_conciliacao_id IS NOT OLD.rastreio_conciliacao_id OR NEW.rastreio_liquidacao_id IS NOT OLD.rastreio_liquidacao_id)
 THEN RAISE(ABORT,'Movimentação rastreada não pode ser alterada') END;
END;
CREATE TRIGGER importacao_qprof_titulos_vinculos BEFORE UPDATE ON importacao_qprof_titulos BEGIN
 SELECT CASE WHEN NEW.rastreio_conciliacao_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workflow_rastreio_transferencias WHERE id=NEW.rastreio_conciliacao_id AND tipo='conciliacao')
 THEN RAISE(ABORT,'Referência de conciliação inválida') END;
 SELECT CASE WHEN NEW.rastreio_liquidacao_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workflow_rastreio_transferencias WHERE id=NEW.rastreio_liquidacao_id AND tipo='liquidacao')
 THEN RAISE(ABORT,'Referência de liquidação inválida') END;
 SELECT CASE WHEN (OLD.rastreio_conciliacao_id IS NOT NULL AND NEW.rastreio_conciliacao_id IS NOT OLD.rastreio_conciliacao_id)
 OR (OLD.rastreio_liquidacao_id IS NOT NULL AND NEW.rastreio_liquidacao_id IS NOT OLD.rastreio_liquidacao_id)
 OR ((OLD.rastreio_conciliacao_id IS NOT NULL OR OLD.rastreio_liquidacao_id IS NOT NULL) AND NEW.valor!=OLD.valor)
 THEN RAISE(ABORT,'Título já rastreado nesta etapa') END;
END;
CREATE TRIGGER importacao_qprof_titulos_insert_vinculos BEFORE INSERT ON importacao_qprof_titulos BEGIN
 SELECT CASE WHEN NEW.rastreio_conciliacao_id IS NOT NULL OR NEW.rastreio_liquidacao_id IS NOT NULL
 THEN RAISE(ABORT,'Cadastre o título antes de confirmar o rastreio') END;
END;
CREATE TRIGGER importacao_qprof_titulos_exclusao BEFORE DELETE ON importacao_qprof_titulos WHEN OLD.rastreio_conciliacao_id IS NOT NULL OR OLD.rastreio_liquidacao_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'Título rastreado não pode ser excluído');
END;
CREATE TRIGGER workflow_rastreio_transferencia_imutavel BEFORE UPDATE ON workflow_rastreio_transferencias BEGIN
 SELECT RAISE(ABORT,'Transferência confirmada não pode ser alterada');
END;
CREATE VIEW workflow_rastreio_titulos AS SELECT t.*, c.extrato_id AS extrato_entrada_id,
 c.data AS data_entrada, l.extrato_id AS extrato_saida_id, l.data AS data_saida,
 CASE WHEN c.data IS NOT NULL THEN CAST(julianday(COALESCE(l.data,date('now')))-julianday(c.data) AS INTEGER) END AS dias_na_conta
 FROM importacao_qprof_titulos t LEFT JOIN workflow_rastreio_transferencias c ON c.id=t.rastreio_conciliacao_id
 LEFT JOIN workflow_rastreio_transferencias l ON l.id=t.rastreio_liquidacao_id;
