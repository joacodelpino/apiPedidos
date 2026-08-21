import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config();
const dbUrl =
  process.env.DATABASE_URL ||
  "postgres://postgres:1234@localhost:5432/api_pedidos";

export const sql = postgres(dbUrl);
