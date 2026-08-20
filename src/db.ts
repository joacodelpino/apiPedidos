import postgres from "postgres";

export const sql = postgres(
  "postgres://postgres:1234@localhost:5432/api_pedidos",
);
