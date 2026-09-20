-- Rename the persisted column and its trigger references without changing balances.
ALTER TABLE workflow_saldos RENAME COLUMN saldo_askora TO saldo_sistema;
