import express from 'express';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

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
 * La validación CSRF se incorporará mediante el middleware correspondiente.
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
 * PENDIENTE DE CORRECCIÓN POR PERSONA C:
 *  - Validar el host contra una lista blanca.
 *  - Utilizar spawn() con argumentos separados y shell:false.
 */
router.post('/probar-conexion', (req, res) => {
  const { host } = req.body || {};

  // Pendiente: reemplazar exec por spawn y validar el host.
  const comando = `ping -c 3 ${host}`;

  exec(comando, (error, stdout, stderr) => {
    res.json({
      comando,
      salida: stdout,
      error: stderr || (error ? error.message : null),
    });
  });
});

/**
 * POST /api/admin/subir-archivo
 *
 * PENDIENTE DE CORRECCIÓN POR PERSONA C:
 *  - Validar extensión, MIME y tamaño.
 *  - Generar un nombre aleatorio.
 *  - Evitar path traversal.
 *  - Almacenar los archivos fuera del árbol público.
 */
router.post('/subir-archivo', express.json({ limit: '8mb' }), (req, res, next) => {
  try {
    const { nombre, contenidoBase64 } = req.body || {};

    if (!nombre || !contenidoBase64) {
      return res.status(400).json({ error: 'Falta el archivo.' });
    }

    const buffer = Buffer.from(contenidoBase64, 'base64');

    fs.mkdirSync(config.uploadsDir, { recursive: true });

    const destino = path.join(config.uploadsDir, nombre);

    fs.writeFileSync(destino, buffer);

    res.json({
      mensaje: 'Archivo subido.',
      url: `/uploads/${nombre}`,
      bytes: buffer.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
