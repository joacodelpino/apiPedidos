import { z } from "zod";

// ============================================
// Productos
// ============================================
export const crearProductoSchema = z.object({
  nombre: z.string().min(2).max(100),
  precio: z.number().positive(),
  stock: z.number().int().min(0),
});

export const actualizarProductoSchema = z
  .object({
    nombre: z.string().min(2).max(100),
    precio: z.number().positive(),
    stock: z.number().int().min(0),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  });

export const validarId = z.object({
  id: z.coerce.number().int().positive(),
});

// ============================================
// Clientes
// ============================================
export const crearClienteSchema = z.object({
  nombre: z.string().min(2).max(100),
  email: z.email(),
  telefono: z.coerce.number().int().positive(),
});

// ============================================
// Items de un pedido (tal como los manda el cliente)
// Solo producto_id + cantidad — el precio_unitario
// se calcula en el servidor, nunca lo manda el cliente.
// ============================================
const itemPedidoSchema = z.object({
  producto_id: z.coerce.number().int().positive(),
  cantidad: z.coerce.number().int().positive(),
});

// ============================================
// Pedidos
// ============================================
export const crearPedidoSchema = z.object({
  cliente_id: z.coerce.number().int().positive(),
  items: z
    .array(itemPedidoSchema)
    .min(1, "El pedido debe tener al menos un item"),
});

// Item ya calculado, listo para insertar en pedido_items
// (uso interno del servidor, no valida el body del cliente)
export const crearItemSchema = z.object({
  pedido_id: z.coerce.number().int().positive(),
  producto_id: z.coerce.number().int().positive(),
  cantidad: z.coerce.number().int().positive(),
  precio_unitario: z.number().positive(),
});

// Para PATCH /pedidos/:id/estado
export const actualizarEstadoPedidoSchema = z.object({
  estado: z.enum(["pendiente", "confirmado", "entregado", "cancelado"]),
});

// Validacion para
