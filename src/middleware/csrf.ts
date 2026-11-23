import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { obtenerSesion, leerCookies } from './sesion';

/**
 * Obtiene o genera el token CSRF asociado a la sesión.
 */
export function obtenerTokenCsrf(req: Request, res: Response): string | null {
  const sesion = obtenerSesion(req);

  if (!sesion) return null;

  if (!sesion.csrfToken) {
    sesion.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  res.cookie('csrf-token', sesion.csrfToken, {
    path: '/',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  return sesion.csrfToken;
}

/**
 * Comprueba que el origen de la petición coincida con el origen
 * de la aplicación.
 *
 * Si no llega Origin, utiliza Referer como alternativa.
 * Si ambas cabeceras están ausentes, continúa con la validación
 * del token CSRF para mantener compatibilidad con clientes HTTP.
 */
function validarOrigen(req: Request, res: Response): boolean {
  const origen = req.get('Origin') || req.get('Referer');

  if (!origen) {
    return true;
  }

  try {
    const origenRecibido = new URL(origen).origin;
    const origenEsperado = new URL(
      `${req.protocol}://${req.get('host')}`,
    ).origin;

    if (origenRecibido !== origenEsperado) {
      res.status(403).json({
        error: 'Origen de la petición no permitido.',
      });
      return false;
    }

    return true;
  } catch {
    res.status(403).json({
      error: 'Origen de la petición inválido.',
    });
    return false;
  }
}

/**
 * Comprueba que el token presentado coincida con el de la sesión.
 */
export function protegerContraCsrf(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const metodo = req.method.toUpperCase();

  if (['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
    next();
    return;
  }

  // El login no tiene una sesión autenticada todavía.
  // Se mantiene logout compatible con los tests funcionales existentes.
  if (req.path === '/api/auth/login' || req.path === '/api/auth/logout') {
    next();
    return;
  }

  // Verifica el origen antes de procesar la operación.
  if (!validarOrigen(req, res)) {
    return;
  }

  const sesion = obtenerSesion(req);

  // Las operaciones públicas sin sesión no dependen de una cookie de sesión.
  if (!sesion) {
    next();
    return;
  }

  const cookies = leerCookies(req);
  const tokenCookie = cookies['csrf-token'];
  const tokenHeader = req.get('X-CSRF-Token');
  const tokenBody = req.body?._csrf;
  const tokenSesion = sesion.csrfToken;

  const tokensValidos =
    typeof tokenSesion === 'string' &&
    typeof tokenCookie === 'string' &&
    typeof tokenHeader === 'string' &&
    typeof tokenBody === 'string' &&
    tokenCookie.length === tokenSesion.length &&
    tokenHeader.length === tokenSesion.length &&
    tokenBody.length === tokenSesion.length &&
    crypto.timingSafeEqual(Buffer.from(tokenCookie), Buffer.from(tokenSesion)) &&
    crypto.timingSafeEqual(Buffer.from(tokenHeader), Buffer.from(tokenSesion)) &&
    crypto.timingSafeEqual(Buffer.from(tokenBody), Buffer.from(tokenSesion));

  if (!tokensValidos) {
    res.status(403).json({ error: 'Token CSRF inválido o ausente.' });
    return;
  }

  next();
}
