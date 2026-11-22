import express from 'express';

const router = express.Router();

/**
 * Endpoint de diagnostico.
 *
 * CORRECCION — exposicion de informacion sensible (OWASP A01:2021 / A05:2021)
 * antes devolvia `process.env` completo (credenciales, secretos) sin autenticacion.
 * ahora solo informa que el servicio esta activo: no expone variables de entorno,
 * datos de la base, versiones ni metricas internas.
 */
router.get('/', (_req, res) => {
  res.json({ estado: 'ok' }); //responde ok para saber que els ervidor esta vivo
});

export default router;