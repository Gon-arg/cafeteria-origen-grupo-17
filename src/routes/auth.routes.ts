import express from 'express';
import * as usuarios from '../services/usuarios.service';
import {
  crearSesion,
  destruirSesion,
  obtenerSesion,
} from '../middleware/sesion';
import { limitarIntentosLogin } from '../middleware/rate-limit';

const router = express.Router();

/**
 * Inicio de sesión.
 *
 * SEGURIDAD:
 *  - La verificación de credenciales utiliza el servicio de usuarios.
 *  - Las contraseñas se verifican mediante bcrypt en el servicio.
 *  - El mensaje de error es genérico para evitar la enumeración de usuarios.
 *  - Se limitan los intentos para prevenir ataques de fuerza bruta.
 *  - El identificador de sesión se genera aleatoriamente y se regenera
 *    al iniciar sesión.
 */
router.post('/login', limitarIntentosLogin, async (req, res, next) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Falta usuario o contraseña.' });
    }

    const usuario = await usuarios.autenticar(username, password);

    if (!usuario) {
      return res.status(401).json({
        error: 'Usuario o contraseña incorrectos.',
      });
    }

    crearSesion(req, res, {
      id: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
      nombre: usuario.nombre,
    });

    res.json({
      mensaje: `¡Bienvenido, ${usuario.nombre}!`,
      usuario: {
        id: usuario.id,
        username: usuario.username,
        rol: usuario.rol,
        nombre: usuario.nombre,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Cierre de sesión.
 *
 * SEGURIDAD:
 *  - Invalida la sesión en el servidor.
 *  - Elimina la cookie del navegador con las mismas opciones
 *    utilizadas al crearla.
 */
router.post('/logout', (req, res) => {
  destruirSesion(req);

  res.clearCookie('sid', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  res.json({ mensaje: 'Sesión cerrada.' });
});

/** Devuelve el usuario de la sesión actual. */
router.get('/yo', (req, res) => {
  const sesion = obtenerSesion(req);

  if (!sesion) {
    return res.status(401).json({ error: 'Necesitás iniciar sesión.' });
  }

  res.json({ usuario: sesion.usuario });
});

export default router;
