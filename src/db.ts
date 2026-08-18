import postgres from "postgres";

// Ajustá usuario/password si tu PostgreSQL local los requiere:
// postgres://usuario:password@localhost:5432/api_pedidos
export const sql = postgres(
  "postgres://postgres:1234@localhost:5432/apiPedidos"
);
