import * as db from '../db';
import { calcularPrecio } from '../catalogo';
import { errorValidacion, validarEntero, validarTexto } from '../validacion';
import type { Pedido, PedidoConItems, PedidoItem, Producto } from '../tipos';

/** Un renglón del pedido, tal como llega en el cuerpo de la petición. */
export interface ItemPedido {
  productoId: number;
  cantidad: number;
}

/** Pedido nuevo, tal como llega en el cuerpo de la petición. */
export interface NuevoPedido {
  mesa: string;
  cliente: string;
  items: ItemPedido[];
}

/** Id tal como llega en la URL (texto) o ya convertido. */
type Id = number | string;

/**
 * Servicio de pedidos.
 *
 * La entrada se valida en el servidor (tipo, rango, longitud y formato)
 * antes de tocar la base, y las consultas están parametrizadas.
 */

/**
 * Crea un pedido a partir de una lista de items { productoId, cantidad }.
 * Total = suma de calcularPrecio(producto) x cantidad
 */
export async function crear(datos: NuevoPedido): Promise<PedidoConItems | null> {
  // Validación de TIPO, RANGO, LONGITUD y FORMATO (lista blanca) en el servidor.
  const mesa = validarTexto(datos.mesa, 'La mesa', 1, 10, /^[A-Za-z0-9 -]+$/);
  const cliente = validarTexto(datos.cliente, 'El nombre del cliente', 2, 40);

  if (!Array.isArray(datos.items) || datos.items.length < 1 || datos.items.length > 20) {
    throw errorValidacion('El pedido debe tener entre 1 y 20 items.');
  }

  const filas: { productoId: number; cantidad: number; precioUnitario: number }[] = [];

  for (const item of datos.items) {
    if (typeof item !== 'object' || item === null) {
      throw errorValidacion('Item de pedido inválido.');
    }
    const productoId = validarEntero(item.productoId, 'El producto', 1, 1000000);
    const cantidad = validarEntero(item.cantidad, 'La cantidad', 1, 50);

    const producto = await buscarProducto(productoId);
    if (!producto) {
      throw errorValidacion('El producto indicado no existe.');
    }
    filas.push({
      productoId: producto.id,
      cantidad,
      precioUnitario: calcularPrecio(producto),
    });
  }

  const total = filas.reduce(
    (acc, f) => acc + f.precioUnitario * f.cantidad,
    0
  );

  const { rows } = await db.query<Pedido>(
    `INSERT INTO pedidos (mesa, cliente, estado, total)
     VALUES ($1, $2, 'abierto', $3)
     RETURNING *`,
    [mesa, cliente, total]
  );
  const pedido = rows[0];

  for (const fila of filas) {
    await db.query(
      `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
       VALUES ($1, $2, $3, $4)`,
      [pedido.id, fila.productoId, fila.cantidad, fila.precioUnitario]
    );
  }

  return obtenerConItems(pedido.id);
}

/** Busca un producto por id (helper interno). */
async function buscarProducto(productoId: number): Promise<Producto> {
  const { rows } = await db.query<Producto>('SELECT * FROM productos WHERE id = $1', [productoId]);
  return rows[0];
}

/** Lista pedidos (con filtro opcional por mesa). */
export async function listar(mesa?: string): Promise<Pedido[]> {
  let sql = 'SELECT * FROM pedidos';
  const params: unknown[] = [];
  if (mesa) {
    params.push(String(mesa));
    sql += ' WHERE mesa = $1';
  }
  sql += ' ORDER BY id DESC';

  const { rows } = await db.query<Pedido>(sql, params);
  return rows;
}

/** Devuelve un pedido con sus items. */
export async function obtenerConItems(id: Id): Promise<PedidoConItems | null> {
  const { rows: pedidos } = await db.query<Pedido>(
    'SELECT * FROM pedidos WHERE id = $1',
    [id]
  );
  const pedido = pedidos[0];
  if (!pedido) return null;

  const { rows: items } = await db.query<PedidoItem>(
    `SELECT pi.*, pr.nombre AS producto_nombre
       FROM pedido_items pi
       JOIN productos pr ON pr.id = pi.producto_id
      WHERE pi.pedido_id = $1`,
    [id]
  );

  return { ...pedido, items };
}

/** Cambia el estado de un pedido. */
export async function cambiarEstado(id: Id, estado: string): Promise<Pedido | null> {
  const { rows } = await db.query<Pedido>(
    'UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING *',
    [estado, id]
  );
  return rows[0] || null;
}