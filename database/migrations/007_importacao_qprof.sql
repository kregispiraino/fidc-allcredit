-- rebuild-referenced-tables
CREATE TABLE importacao_qprof_titulos_nova (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL,
  cedente TEXT NOT NULL DEFAULT '',
  sacado TEXT NOT NULL DEFAULT '',
  valor INTEGER NOT NULL CHECK(valor>0 AND valor<=9000000000000),
  data_liquidacao TEXT,
  carteira TEXT NOT NULL DEFAULT '',
  carteira_interna TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO importacao_qprof_titulos_nova(id,numero,cedente,sacado,valor,data_liquidacao,created_at,updated_at)
  SELECT id,numero,cedente,sacado,valor,pagamento,created_at,updated_at FROM importacao_qprof_titulos;
DROP TABLE importacao_qprof_titulos;
ALTER TABLE importacao_qprof_titulos_nova RENAME TO importacao_qprof_titulos;
CREATE INDEX importacao_qprof_data ON importacao_qprof_titulos(data_liquidacao,id);
CREATE INDEX importacao_qprof_carteira ON importacao_qprof_titulos(carteira,data_liquidacao,id);
CREATE INDEX importacao_qprof_interna ON importacao_qprof_titulos(carteira_interna,data_liquidacao,id);
CREATE INDEX importacao_qprof_valor ON importacao_qprof_titulos(valor);
CREATE VIRTUAL TABLE importacao_qprof_busca USING fts5(numero,cedente,sacado,carteira,carteira_interna,
  content='importacao_qprof_titulos',content_rowid='id',tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER importacao_qprof_busca_insert AFTER INSERT ON importacao_qprof_titulos BEGIN
  INSERT INTO importacao_qprof_busca(rowid,numero,cedente,sacado,carteira,carteira_interna)
  VALUES(new.id,new.numero,new.cedente,new.sacado,new.carteira,new.carteira_interna);
END;
CREATE TRIGGER importacao_qprof_busca_delete AFTER DELETE ON importacao_qprof_titulos BEGIN
  INSERT INTO importacao_qprof_busca(importacao_qprof_busca,rowid,numero,cedente,sacado,carteira,carteira_interna)
  VALUES('delete',old.id,old.numero,old.cedente,old.sacado,old.carteira,old.carteira_interna);
END;
CREATE TRIGGER importacao_qprof_busca_update AFTER UPDATE ON importacao_qprof_titulos BEGIN
  INSERT INTO importacao_qprof_busca(importacao_qprof_busca,rowid,numero,cedente,sacado,carteira,carteira_interna)
  VALUES('delete',old.id,old.numero,old.cedente,old.sacado,old.carteira,old.carteira_interna);
  INSERT INTO importacao_qprof_busca(rowid,numero,cedente,sacado,carteira,carteira_interna)
  VALUES(new.id,new.numero,new.cedente,new.sacado,new.carteira,new.carteira_interna);
END;
INSERT INTO importacao_qprof_busca(importacao_qprof_busca) VALUES('rebuild');
CREATE TABLE importacao_qprof_base (
  id INTEGER PRIMARY KEY CHECK(id=1),
  versao INTEGER NOT NULL DEFAULT 0,
  arquivo TEXT,
  quantidade INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
INSERT INTO importacao_qprof_base(id,quantidade) SELECT 1,count(*) FROM importacao_qprof_titulos;
ALTER TABLE workflow_rastreio_itens ADD COLUMN data_liquidacao TEXT;
ALTER TABLE workflow_rastreio_itens ADD COLUMN carteira TEXT NOT NULL DEFAULT '';
ALTER TABLE workflow_rastreio_itens ADD COLUMN carteira_interna TEXT NOT NULL DEFAULT '';
UPDATE workflow_rastreio_itens SET data_liquidacao=(SELECT data_liquidacao FROM importacao_qprof_titulos WHERE id=qprof_titulo_id);
