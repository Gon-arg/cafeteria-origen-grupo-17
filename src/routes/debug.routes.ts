import express from 'express';

import { requiereSesion, requiereRol } from '../middleware/auth';

const router = express.Router();

/**
 * Endpoint de diagnóstico.
 *
 * CORRECCIÓN — exposición de información sensible (OWASP A01:2021 / A05:2021)
 *  - Antes devolvía todas las variables de entorno (credenciales, secretos) sin autenticación.
 *  - Ahora exige sesión válida y rol admin (requiereSesion + requiereRol).
 *  - Además solo informa que el servicio está activo: no expone datos de la
 *    base, versiones ni métricas internas.
 */
router.use(requiereSesion, requiereRol('admin'));

router.get('/', (_req, res) => {
  res.json({ estado: 'ok' }); // responde ok para saber que el servidor está vivo
});

export default router;