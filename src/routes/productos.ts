import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { sql } from "../db.ts";
import {
  crearProductoSchema,
  actualizarProductoSchema,
} from "../schemas/producto.ts";
import { validarId } from "../schemas/common.ts";

export default fp(async function productos(fastify: FastifyInstance) {
  fastify.get("/productos", async (req, res) => {
    try {
      const productos = await sql`
        SELECT *
        FROM productos`;
      res.status(200).send(productos);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Error al obtener los productos" });
    }
  });

  fastify.get("/productos/:id", async (req, res) => {
    const { id } = req.params as { id: string };

    try {
      await validarId.parseAsync({ id });
    } catch (err) {
      console.error(err);
      res.status(400).send({ error: "Datos invalidos" });
      return;
    }

    try {
      const producto = await sql`
        SELECT *
        FROM productos
        WHERE id=${id}`;
      if (producto.length === 0) {
        res.status(404).send({ error: "Producto no encontrado" });
        return;
      }
      res.status(200).send(producto[0]);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Error al obtener el producto" });
    }
  });

  // Ruta POST protegida (requiere token)
  fastify.post(
    "/productos",
    { onRequest: [fastify.authenticate] },
    async (req, res) => {
      try {
        await crearProductoSchema.parseAsync(req.body);
      } catch (err) {
        console.error(err);
        res.status(400).send({ error: "Datos invalidos" });
        return;
      }

      const { nombre, precio, stock } = req.body as {
        nombre: string;
        precio: number;
        stock: number;
      };

      try {
        const [productoInsertado] = await sql`
          INSERT INTO productos (nombre, precio, stock)
          VALUES (${nombre}, ${precio}, ${stock})
          RETURNING *
        `;
        res.status(201).send(productoInsertado);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Error al insertar el producto" });
      }
    },
  );

  // Ruta DELETE protegida (requiere token)
  fastify.delete(
    "/productos/:id",
    { onRequest: [fastify.authenticate] },
    async (req, res) => {
      const { id } = req.params as { id: string };

      try {
        await validarId.parseAsync({ id });
      } catch (err) {
        console.error(err);
        res.status(400).send({ error: "Datos invalidos" });
        return;
      }

      try {
        const productoAEliminar =
          await sql`SELECT * FROM productos WHERE id=${id}`;
        if (productoAEliminar.length === 0) {
          res.status(404).send({ error: "Producto no encontrado" });
          return;
        }
        await sql`DELETE FROM productos WHERE id=${id}`;
        res.status(204).send();
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Error al eliminar el producto" });
      }
    },
  );

  // Ruta PUT protegida (requiere token)
  fastify.put(
    "/productos/:id",
    { onRequest: [fastify.authenticate] },
    async (req, res) => {
      const { id } = req.params as { id: string };

      try {
        await validarId.parseAsync({ id });
      } catch (err) {
        console.error(err);
        res.status(400).send({ error: "Datos invalidos" });
        return;
      }

      try {
        await actualizarProductoSchema.parseAsync(req.body);
      } catch (err) {
        console.error(err);
        res.status(400).send({ error: "Datos invalidos" });
        return;
      }

      const { nombre, precio, stock } = req.body as {
        nombre?: string;
        precio?: number;
        stock?: number;
      };

      try {
        const verifExistenciaProducto =
          await sql`SELECT * FROM productos WHERE id=${id}`;
        if (verifExistenciaProducto.length === 0) {
          res.status(404).send({ error: "Producto no encontrado" });
          return;
        }

        const [productoActualizado] = await sql`
        UPDATE productos
        SET
          nombre = COALESCE(${nombre ?? null}, nombre),
          precio = COALESCE(${precio ?? null}, precio),
          stock = COALESCE(${stock ?? null}, stock)
        WHERE id = ${id}
        RETURNING *
      `;
        res.status(200).send(productoActualizado);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Error al actualizar el producto" });
      }
    },
  );
});
