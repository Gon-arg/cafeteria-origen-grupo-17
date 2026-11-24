/**
 * Gestión de sesiones.
 *
 * -----------------------------------------------------------------------------
 * FALLA — Gestión de sesiones insegura (Autenticación insegura)
 * -----------------------------------------------------------------------------
 * 1. El identificador de sesión es un contador incremental (`sesion_1`,
 *    `sesion_2`, ...): es PREDECIBLE y adivinable. Un atacante puede recorrer
 *    los valores y usurpar la sesión de otro usuario (fijación de sesión).
 * 2. La cookie se emite SIN `httpOnly` (JavaScript puede leerla), SIN `secure`
 *    (viaja en texto plano por HTTP) y SIN `sameSite` (el navegador la manda
 *    también en peticiones desde otros sitios → facilita CSRF).
 * 3. Las sesiones NO expiran nunca.
 * 4. Al iniciar sesión no se regenera el identificador.
 * 5. El cierre de sesión sólo borra la cookie del cliente: la sesión sigue
 *    viva en el servidor.
 *
 * Corrección: usar crypto.randomUUID() (o crypto.randomBytes -> hex) para el
 * id, con expiración por inactividad y absoluta, cookie con
 * { httpOnly: true, secure: true, sameSite: 'lax' }, regeneración del id tras
 * el login y borrado de la sesión en el servidor al hacer logout.
 * -----------------------------------------------------------------------------
 */


import crypto from 'crypto';
import type { Request, Response } from 'express';

import type { Sesion, UsuarioSesion } from '../tipos';

export const sesiones = new Map<string, Sesion>();

// Tiempo máximo de inactividad de una sesión: 30 minutos.
const DURACION_SESION_MS = 30 * 60 * 1000;

/** Lee las cookies de la petición. */
export function leerCookies(req: Request): Record<string, string> {
  const cookies: Record<string, string> = {};
  const header = req.headers.cookie;

  if (!header) return cookies;

  for (const parte of header.split(';')) {
    const separador = parte.indexOf('=');
    if (separador < 0) continue;

    const nombre = parte.slice(0, separador).trim();
    const valor = parte.slice(separador + 1).trim();

    if (nombre) cookies[nombre] = decodeURIComponent(valor);
  }

  return cookies;
}

/** Crea una sesión nueva con identificador criptográficamente aleatorio. */
export function crearSesion(
  req: Request,
  res: Response,
  usuario: UsuarioSesion,
): string {
  // Invalida una sesión anterior si se vuelve a autenticar con la misma cookie.
  destruirSesion(req);

  const id = crypto.randomBytes(32).toString('hex');
  const ahora = Date.now();

  sesiones.set(id, {
    usuario,
    creadaEn: ahora,
    expiraEn: ahora + DURACION_SESION_MS,
  });

  res.cookie('sid', id, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: DURACION_SESION_MS,
  });

  return id;
}

/** Devuelve la sesión si existe y no expiró. */
export function obtenerSesion(req: Request): Sesion | null {
  const id = leerCookies(req).sid;
  if (!id) return null;

  const sesion = sesiones.get(id);
  if (!sesion) return null;

  if (sesion.expiraEn === null || Date.now() >= sesion.expiraEn) {
    sesiones.delete(id);
    return null;
  }

  return sesion;
}

/** Invalida la sesión en el servidor. */
export function destruirSesion(req: Request): void {
  const id = leerCookies(req).sid;
  if (id) sesiones.delete(id);
}
