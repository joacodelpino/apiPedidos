import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import type { FastifyRequest, FastifyReply } from "fastify";
import dotenv from "dotenv";

import productosRoutes from "./routes/productos.ts";
import clientesRoutes from "./routes/clientes.ts";
import pedidosRoutes from "./routes/pedidos.ts";
import authRoutes from "./routes/auth.ts";

dotenv.config();

const app = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  },
});

const fastifySecret = process.env.FASTIFY_SECRET_JWT || "dev-secret";
app.register(fastifyJwt, {
  secret: fastifySecret,
});

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

app.decorate("authenticate", async function (req: any, res: any) {
  try {
    await req.jwtVerify();
  } catch (err) {
    res.status(401).send({ error: "Token invalido" });
  }
});

app.get("/", (req, res) => {
  res.send({ status: "ok" });
});

app.register(productosRoutes);
app.register(clientesRoutes);
app.register(pedidosRoutes);
app.register(authRoutes);

app.listen({ port: 3000 }, (err, address) => {
  console.log(`Server is now listening on ${address}`);
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
