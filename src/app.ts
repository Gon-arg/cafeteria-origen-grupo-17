import path from 'path';
import express from 'express';
import helmet from 'helmet';

import config from './config';
import { rutaNoEncontrada, manejadorErrores } from './middleware/errores';
import { obtenerSesion } from './middleware/sesion';
import { obtenerTokenCsrf, protegerContraCsrf } from './middleware/csrf';
import { requiereSesion, requiereRol } from './middleware/auth';

import authRoutes from './routes/auth.routes';
import productosRoutes from './routes/productos.routes';
import pedidosRoutes from './routes/pedidos.routes';
import reportesRoutes from './routes/reportes.routes';
import comentariosRoutes from './routes/comentarios.routes';
import adminRoutes from './routes/admin.routes';
import debugRoutes from './routes/debug.routes';

const app = express();

/**
 * Cabeceras de seguridad (helmet) y Content Security Policy.
 *
 * SEGURIDAD:
 *  - script-src 'self': solo se ejecutan scripts servidos por este mismo sitio.
 *    Un <script> o un onerror= inyectado por XSS queda bloqueado por el navegador.
 *  - object-src 'none': sin plugins (Flash, applets).
 *  - frame-ancestors 'none': el sitio no se puede embeber en un iframe (clickjacking).
 *  - base-uri y form-action 'self': evitan redirigir formularios a otro sitio.
 *  - helmet agrega además X-Content-Type-Options: nosniff, Referrer-Policy, etc.
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

/**
 * Configuración de la aplicación.
 */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Archivos subidos por el panel de administración.
// Solo se aceptan imágenes validadas (ver admin.routes.ts). Aun así se sirven
// sin listado de carpeta, sin archivos ocultos y con una CSP que no permite
// ejecutar nada si alguien abre el archivo directamente.
app.use(
  '/uploads',
  express.static(config.uploadsDir, {
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'none'; sandbox");
    },
  })
);

// Sitio web estático.
app.use(express.static(path.join(__dirname, 'public')));

// --- API --------------------------------------------------------------------

app.get('/api/salud', (req, res) => {
  res.json({
    ok: true,
    servicio: 'cafeteria-origen',
    hora: new Date().toISOString(),
  });
});

/**
 * Entrega el token CSRF asociado a la sesión autenticada.
 */
app.get('/api/csrf-token', (req, res) => {
  const sesion = obtenerSesion(req);

  if (!sesion) {
    res.status(401).json({ error: 'Necesitás iniciar sesión.' });
    return;
  }

  const token = obtenerTokenCsrf(req, res);

  if (!token) {
    res.status(401).json({ error: 'Necesitás iniciar sesión.' });
    return;
  }

  res.json({ csrfToken: token, token });
});

// Protección de las peticiones que modifican información.
app.use(protegerContraCsrf);

// Registro de rutas.
app.use('/api/auth', authRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/comentarios', comentariosRoutes);
app.use('/api/admin', adminRoutes);

// Diagnóstico: solo para administradores con sesión válida.
app.use('/api/_diagnostico', requiereSesion, requiereRol('admin'), debugRoutes);

app.use('/api', rutaNoEncontrada);

app.use(manejadorErrores);

export default app;