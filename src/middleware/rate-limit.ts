import rateLimit from 'express-rate-limit';

/**
 * Limita los intentos de inicio de sesión por combinación
 * de dirección IP y nombre de usuario.
 */
export const limitarIntentosLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => {
    const ip = req.ip ?? 'ip-desconocida';
    const username = String(req.body?.username ?? '')
      .trim()
      .toLowerCase();

    return `${ip}:${username}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos de inicio de sesión. Intentá nuevamente más tarde.',
  },
});
