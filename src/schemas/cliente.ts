import { z } from "zod";

export const crearClienteSchema = z.object({
  nombre: z.string().min(2).max(100),
  email: z.email(),
  telefono: z.coerce.number().int().positive(),
});
