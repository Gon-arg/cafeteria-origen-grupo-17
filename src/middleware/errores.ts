/**
 * manejo de errores.
 *
 * CORRECCION — Exposicion de informacion sensible:
 * antes la respuesta incluia el stack trace y el mensaje original de cualquier
 * error, lo que revelaba rutas internas, tablas, consultas SQL y versiones.
 * ahora el detalle completo queda solo en el log del servidor y al cliente se
 * le devuelve un mensaje generico en los errores 5xx.
 */

import type { NextFunction, Request, Response } from 'express';

import type { ErrorHttp } from '../tipos';

export function rutaNoEncontrada(_req: Request, res: Response): void {
  // No se refleja la URL pedida: mensaje fijo.
  res.status(404).json({ error: 'Ruta no encontrada' });
}

// Express reconoce al manejador de errores por sus CUATRO parámetros: `next`
// tiene que estar aunque no se use.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function manejadorErrores(err: ErrorHttp, req: Request, res: Response, next: NextFunction): void {
  // El detalle real (mensaje + stack) queda solo en el servidor.
  console.error('[error]', req.method, req.originalUrl, err.stack || err.message);

  const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;

  res.status(status).json({
    error: status === 500 ? 'Error interno del servidor' : (err.message || 'Solicitud inválida'),
  });
}