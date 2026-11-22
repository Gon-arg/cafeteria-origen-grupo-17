import * as db from './db';
import { CATALOGO } from './catalogo';
import type { Rol } from './tipos';
import bcrypt from 'bcryptjs';

interface UsuarioInicial {
  username: string;
  password: string;
  rol: Rol;
  nombre: string;
}

/**
 * Carga los datos iniciales (usuarios y catálogo) si la base está vacía.
 *
 * FALLA — Almacenamiento inseguro de credenciales:
 * las contraseñas de los usuarios se guardan en TEXTO PLANO.
 * La corrección es hashear con bcrypt + salt por usuario
 * (bcryptjs ya está instalado como dependencia del proyecto).
 */

export const USUARIOS_INICIALES: UsuarioInicial[] = [
  {
    username: 'admin',
    password: 'admin',
    rol: 'admin',
    nombre: 'Administración',
  },
  {
    username: 'valentina',
    password: 'origen2024',
    rol: 'admin',
    nombre: 'Valentina',
  },
  {
    username: 'barista',
    password: 'cafe123',
    rol: 'barista',
    nombre: 'Barista',
  },
  {
    username: 'mozo',
    password: 'mozo123',
    rol: 'mozo',
    nombre: 'Mozo de sala',
  },
  {
    username: 'cliente',
    password: 'cliente',
    rol: 'cliente',
    nombre: 'Cliente',
  },
];

export async function inicializarBase(): Promise<void> {
  // --- Usuarios -------------------------------------------------------------
  // Cuentas de ejemplo SÓLO para el entorno de práctica. En producción no se
  // crean con una clave por defecto: cada una exige su variable de entorno
  // (PASSWORD_ADMIN, PASSWORD_VALENTINA, ...). Si ya existe el usuario no se
  // vuelve a hashear (bcrypt es lento a propósito).
  const esProduccion = process.env.NODE_ENV === 'production';

  for (const usuario of USUARIOS_INICIALES) {
    const variable = `PASSWORD_${usuario.username.toUpperCase()}`;
    const clave = process.env[variable] || (esProduccion ? null : usuario.password);
    if (!clave) {
      console.warn(`[origen] ${usuario.username}: falta ${variable} en producción, no se crea la cuenta.`);
      continue;
    }

    const existente = await db.query('SELECT 1 FROM usuarios WHERE username = $1', [usuario.username]);
    if (existente.rows.length > 0) continue;

    const hash = await bcrypt.hash(clave, 12);
    await db.query(
      `INSERT INTO usuarios (username, password, rol, nombre)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING`,
      [usuario.username, hash, usuario.rol, usuario.nombre]
    );
  }

  // --- Catálogo -------------------------------------------------------------
  for (const producto of CATALOGO) {
    await db.query(
      `INSERT INTO productos
         (nombre, tipo, variedad, tamano, gramos, precio_base, precio_por_gramo, descripcion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (nombre) DO NOTHING`,
      [
        producto.nombre,
        producto.tipo,
        producto.variedad,
        producto.tamano,
        producto.gramos,
        producto.precio_base,
        producto.precio_por_gramo,
        producto.descripcion,
      ]
    );
  }
}
