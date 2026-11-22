import crypto from 'crypto';
import path from 'path';

/**
 * Configuración de la aplicación.
 *
 * Los secretos (usuario y contraseña de la base, secreto de sesión) se leen
 * de variables de entorno: no están escritos en el código ni se versionan.
 */

/** Lee una variable de entorno obligatoria; si falta, la app no arranca. */
function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}.`);
  }
  return valor;
}

export default {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'origen',
    // Mínimos privilegios: usuario de aplicación, nunca el superusuario.
    user: requerida('DB_USER'),
    password: requerida('DB_PASSWORD'),
  },

  // Secreto para firmar el token anti-CSRF. Si no se define SESSION_SECRET,
  // se genera uno aleatorio en cada arranque (nunca uno fijo en el código).
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),

  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'),
};