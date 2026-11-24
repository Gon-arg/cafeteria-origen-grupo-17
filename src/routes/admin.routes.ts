import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';

import config from '../config';
import * as catalogo from '../services/catalogo.service';
import * as usuarios from '../services/usuarios.service';
import { requiereSesion, requiereRol } from '../middleware/auth';
import type { Usuario } from '../tipos';

const router = express.Router();

/**
 * Rutas del panel de administración.
 *
 * SEGURIDAD:
 *  - Se exige una sesión válida mediante requiereSesion.
 *  - Se exige el rol admin mediante requiereRol('admin').
 *  - Los usuarios con rol cliente no pueden acceder a las operaciones
 *    administrativas ni modificar roles.
 */
router.use(requiereSesion, requiereRol('admin'));

/** GET /api/admin/usuarios */
router.get('/usuarios', async (req, res, next) => {
  try {
    res.json({ usuarios: await usuarios.listar() });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/usuarios/:id
 *
 * SEGURIDAD:
 *  - Solamente un administrador puede modificar usuarios y sus roles.
 *  - Se verifica explícitamente el rol antes de aceptar los cambios.
 *  - Los usuarios clientes no pueden autoasignarse privilegios.
 */
router.put('/usuarios/:id', async (req, res, next) => {
  try {
    if (!req.usuario || req.usuario.rol !== 'admin') {
      return res.status(403).json({
        error: 'No tenés permisos para modificar usuarios.',
      });
    }

    const { username, nombre, rol, password } = req.body || {};
    const cambios: Partial<Usuario> = {};

    if (username !== undefined) cambios.username = username;
    if (nombre !== undefined) cambios.nombre = nombre;
    if (rol !== undefined) cambios.rol = rol;
    if (password !== undefined) cambios.password = password;

    const usuario = await usuarios.actualizar(req.params.id, cambios);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/productos — alta de producto. */
router.post('/productos', async (req, res, next) => {
  try {
    const producto = await catalogo.crear(req.body || {});
    res.status(201).json(producto);
  } catch (err) {
    // El nombre del producto es único en la base.
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'Ya existe un producto con ese nombre.' });
    }

    next(err);
  }
});

/** PUT /api/admin/productos/:id */
router.put('/productos/:id', async (req, res, next) => {
  try {
    const producto = await catalogo.actualizar(req.params.id, req.body || {});

    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/productos/:id
 *
 * Las operaciones mutadoras también deberán validar el token anti-CSRF.
 */
router.delete('/productos/:id', async (req, res, next) => {
  try {
    const producto = await catalogo.eliminar(req.params.id);

    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/cambiar-contrasena
 *
 * La operación requiere rol administrador.
 * La validación CSRF se incorpora mediante el middleware correspondiente.
 */
router.post('/cambiar-contrasena', async (req, res, next) => {
  try {
    const { nueva } = req.body || {};

    if (!nueva) {
      return res.status(400).json({ error: 'Falta la contraseña nueva.' });
    }

    const usuario = await usuarios.cambiarPassword(req.usuario!.id, nueva);

    res.json({ mensaje: 'Contraseña actualizada.', usuario });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/probar-conexion
 *
 * SEGURIDAD (inyección de comandos):
 *  - Lista blanca: solo se puede consultar a servidores conocidos.
 *  - El host se valida además con una regex estricta: solo letras, números,
 *    puntos y guiones, sin espacios ni metacaracteres de shell (; | & $ ` etc.).
 *  - No puede empezar con "-" (evita que se interprete como opción de ping).
 *  - Se usa spawn() con argumentos separados y shell:false: el host viaja como
 *    un único argumento y nunca pasa por un intérprete de comandos.
 */
const HOST_VALIDO = /^[a-zA-Z0-9]([a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$/;

// Lista blanca: solo se puede hacer ping a estos destinos conocidos.
const HOSTS_PERMITIDOS = [
  'localhost',
  '127.0.0.1',
  'google.com',
  'cloudflare.com',
  '1.1.1.1',
  '8.8.8.8',
];

router.post('/probar-conexion', (req, res) => {
  const { host } = req.body || {};

  if (typeof host !== 'string' || !HOST_VALIDO.test(host)) {
    return res.status(400).json({ error: 'Host inválido.' });
  }

  if (!HOSTS_PERMITIDOS.includes(host.toLowerCase())) {
    return res.status(400).json({ error: 'Host no permitido.' });
  }

  const proceso = spawn('ping', ['-c', '3', host], {
    shell: false,
    timeout: 15000,
  });

  let salida = '';
  let errores = '';
  let respondido = false;

  const responder = (cuerpo: object) => {
    if (respondido) return;
    respondido = true;
    res.json(cuerpo);
  };

  proceso.stdout.on('data', (d) => { salida += d.toString(); });
  proceso.stderr.on('data', (d) => { errores += d.toString(); });

  proceso.on('error', () => {
    responder({
      comando: `ping -c 3 ${host}`,
      salida,
      error: 'No se pudo ejecutar la prueba de conexión.',
    });
  });

  proceso.on('close', (codigo) => {
    responder({
      comando: `ping -c 3 ${host}`,
      salida,
      error: errores || (codigo !== 0 ? 'El host no respondió.' : null),
    });
  });
});

/**
 * POST /api/admin/subir-archivo
 *
 * SEGURIDAD (subida de archivos):
 *  - Extensión en lista blanca (solo imágenes).
 *  - "MIME" verificado por los primeros bytes del contenido (magic bytes),
 *    no por lo que declara el cliente.
 *  - La extension debe coincidir con el tipo real detectado.
 *  - Tamaño máximo de 2 MB.
 *  - El nombre original NUNCA se usa para armar la ruta: se genera un nombre
 *    aleatorio, lo que elimina el path traversal (../../).
 */
const EXTENSIONES_PERMITIDAS: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
const TAMANO_MAXIMO = 2 * 1024 * 1024; // 2 MB

function detectarMime(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

router.post('/subir-archivo', express.json({ limit: '3mb' }), (req, res, next) => {
  try {
    const { nombre, contenidoBase64 } = req.body || {};

    if (typeof nombre !== 'string' || typeof contenidoBase64 !== 'string' || !nombre || !contenidoBase64) {
      return res.status(400).json({ error: 'Falta el archivo.' });
    }

    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(contenidoBase64)) {
      return res.status(400).json({ error: 'Contenido inválido.' });
    }

    // solo se usa el nombre para sacar la extensión (basename descarta rutas).
    const extension = path.extname(path.basename(nombre)).toLowerCase();
    const mimeEsperado = EXTENSIONES_PERMITIDAS[extension];

    if (!mimeEsperado) {
      return res.status(400).json({ error: 'Tipo de archivo no permitido. Solo imágenes (jpg, png, gif, webp).' });
    }

    const buffer = Buffer.from(contenidoBase64, 'base64');

    if (buffer.length === 0 || buffer.length > TAMANO_MAXIMO) {
      return res.status(413).json({ error: 'El archivo supera el tamaño máximo de 2 MB.' });
    }

    if (detectarMime(buffer) !== mimeEsperado) {
      return res.status(400).json({ error: 'El contenido no coincide con el tipo de archivo.' });
    }

    const nombreSeguro = `${crypto.randomUUID()}${extension}`;

    fs.mkdirSync(config.uploadsDir, { recursive: true });

    const destino = path.join(config.uploadsDir, nombreSeguro);
    fs.writeFileSync(destino, buffer, { flag: 'wx' });

    res.json({
      mensaje: 'Archivo subido.',
      url: `/uploads/${nombreSeguro}`,
      bytes: buffer.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;