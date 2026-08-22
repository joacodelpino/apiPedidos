import { z } from "zod";

export const validarId = z.object({
  id: z.coerce.number().int().positive(),
});
