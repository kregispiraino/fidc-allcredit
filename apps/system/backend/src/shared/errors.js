export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function assert(condition, message, status = 400) {
  if (!condition) throw new AppError(message, status);
}
export function positiveId(value) {
  const id = Number(value);
  assert(Number.isSafeInteger(id) && id > 0, 'Identificador inválido.');
  return id;
}
