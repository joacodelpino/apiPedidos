import { z } from "zod";

// Validacion para email y contraseña
export const signUpSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(50),
});

// Validacion para login
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1, "La contraseña es requerida"),
});
