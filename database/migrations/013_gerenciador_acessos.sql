CREATE TABLE gerenciador_acessos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL COLLATE NOCASE UNIQUE,
  senha_hash TEXT NOT NULL,
  acesso TEXT NOT NULL CHECK(acesso IN ('operador','visualizador')),
  foto TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE sistema_sessao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  acesso_id INTEGER REFERENCES gerenciador_acessos(id) ON DELETE SET NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE sistema_sessao_contas (
  sessao_id INTEGER NOT NULL REFERENCES sistema_sessao(id) ON DELETE CASCADE,
  acesso_id INTEGER NOT NULL REFERENCES gerenciador_acessos(id) ON DELETE CASCADE,
  PRIMARY KEY(sessao_id,acesso_id)
);
CREATE INDEX sistema_sessao_expira ON sistema_sessao(expires_at);
