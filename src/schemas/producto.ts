import { z } from "zod";

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
