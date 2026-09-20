ALTER TABLE workflow_rastreio_transferencias ADD COLUMN observacao_revisao TEXT;
ALTER TABLE workflow_rastreio_registros ADD COLUMN observacao_revisao TEXT;
ALTER TABLE workflow_rastreio_itens ADD COLUMN efeito TEXT NOT NULL DEFAULT 'composicao' CHECK(efeito IN ('composicao','compensacao'));
ALTER TABLE workflow_rastreio_itens ADD COLUMN compensa_registro_id INTEGER REFERENCES workflow_rastreio_registros(id) ON DELETE RESTRICT
 CHECK((efeito='composicao' AND compensa_registro_id IS NULL) OR (efeito='compensacao' AND compensa_registro_id IS NOT NULL));
CREATE TABLE workflow_rastreio_revisoes (
 chave TEXT PRIMARY KEY,
 descricao TEXT NOT NULL,
 alteracoes_json TEXT NOT NULL CHECK(json_valid(alteracoes_json)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
