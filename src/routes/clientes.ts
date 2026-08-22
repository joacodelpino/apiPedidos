import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { sql } from "../db.ts";
import { crearClienteSchema } from "../schemas/cliente.ts";
import { validarId } from "../schemas/common.ts";

export default fp(async function clientes(fastify: FastifyInstance) {
  // Ruta POST protegida (requiere token)
  fastify.post(
    "/clientes",
    { onRequest: [fastify.authenticate] },
    async (req, res) => {
      try {
        await crearClienteSchema.parseAsync(req.body);
      } catch (err) {
        console.error(err);
        res.status(400).send({ error: "Datos invalidos" });
        return;
      }

      const { nombre, email, telefono } = req.body as {
        nombre: string;
        email: string;
        telefono: number;
      };

      try {
        const [clienteInsertado] = await sql`
          INSERT INTO clientes (nombre, email, telefono)
          VALUES (${nombre}, ${email}, ${telefono})
          RETURNING *
        `;
        res.status(201).send(clienteInsertado);
      } catch (err: any) {
        console.error(err);
        if (err.code === "23505") {
          res.status(409).send({ error: "El email ya está registrado" });
          return;
        }
        res.status(500).send({ error: "Error al insertar el cliente" });
      }
    },
  );

  fastify.get("/clientes", async (req, res) => {
    try {
      const clientes = await sql`
        SELECT *
        FROM clientes`;
      res.status(200).send(clientes);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Error al obtener los clientes" });
    }
  });

  fastify.get("/clientes/:id", async (req, res) => {
    const { id } = req.params as { id: string };

    try {
      await validarId.parseAsync({ id });
    } catch (err) {
      console.error(err);
      res.status(400).send({ error: "Datos invalidos" });
      return;
    }

    try {
      const cliente = await sql`
        SELECT *
        FROM clientes
        WHERE id=${id}`;
      if (cliente.length === 0) {
        res.status(404).send({ error: "Cliente no encontrado" });
        return;
      }
      res.status(200).send(cliente[0]);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Error al obtener el cliente" });
    }
  });

  // Ruta GET a /clientes/:id/pedidos, listar pedidos de un cliente CODIGO 200 / 404
  fastify.get("/clientes/:id/pedidos", async (req, res) => {
    const { id } = req.params as { id: string };

    try {
      await validarId.parseAsync(req.params);
    } catch (err) {
      console.error(err);
      res.status(400).send({ error: "Datos invalidos" });
      return;
    }

    try {
      const cliente = await sql`SELECT * FROM clientes WHERE id = ${id}`;
      if (cliente.length === 0) {
        res.status(404).send({ error: "No se encontro el cliente." });
        return;
      }
      try {
        const pedidos =
          await sql`SELECT id, estado FROM pedidos WHERE cliente_id = ${id};`;
        res.status(200).send(pedidos);
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ error: "Error al obtener los pedidos del cliente" });
        return;
      }
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Error al obtener el cliente" });
      return;
    }
  });
});
