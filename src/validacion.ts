import type { ErrorHttp } from './tipos';

/** Error de validación: el manejador de errores lo responde como 400. */
export function errorValidacion(mensaje: string): ErrorHttp {
  const err: ErrorHttp = new Error(mensaje);
  err.status = 400;
  return err;
}

/** Valida que `valor` sea un entero en [min, max]. Acepta números o texto numérico ("3"). */
export function validarEntero(valor: unknown, campo: string, min: number, max: number): number {
  let n = NaN;
  if (typeof valor === 'number') {
    n = valor;
  } else if (typeof valor === 'string' && /^-?\d+$/.test(valor.trim())) {
    n = Number(valor.trim());
  }
  if (!Number.isInteger(n) || n < min || n > max) {
    throw errorValidacion(`${campo} debe ser un número entero entre ${min} y ${max}.`);
  }
  return n;
}

/** Valida que `valor` sea un texto de largo [min, max] (y, opcionalmente, que cumpla un patrón). */
export function validarTexto(
  valor: unknown,
  campo: string,
  min: number,
  max: number,
  patron?: RegExp
): string {
  if (typeof valor !== 'string') {
    throw errorValidacion(`${campo} debe ser un texto.`);
  }
  const t = valor.trim();
  if (t.length < min || t.length > max) {
    throw errorValidacion(`${campo} debe tener entre ${min} y ${max} caracteres.`);
  }
  if (patron && !patron.test(t)) {
    throw errorValidacion(`${campo} tiene caracteres no permitidos.`);
  }
  return t;
}