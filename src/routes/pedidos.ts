import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { sql } from "../db.ts";
import {
  crearPedidoSchema,
  actualizarEstadoPedidoSchema,
} from "../schemas/pedido.ts";
import { validarId } from "../schemas/common.ts";
import { cacheGet, cacheSet, cacheDel } from "../redis.ts";

const transicionesValidas: Record<string, string[]> = {
  pendiente: ["confirmado", "cancelado"],
  confirmado: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

export default fp(async function pedidos(fastify: FastifyInstance) {
  // Ruta POST protegida (requiere token)
  fastify.post(
    "/pedidos",
    { onRequest: [fastify.authenticate] },
    async (req, res) => {
      try {
        await crearPedidoSchema.parseAsync(req.body);
      } catch (err) {
        console.log(err);
        res.status(400).send({ error: "Datos invalidos" });
        return;
      }

      const { cliente_id, items } = req.body as {
        cliente_id: number;
        items: { producto_id: number; cantidad: number }[];
      };

      try {
        const clienteExiste = await sql`
        SELECT EXISTS
        (
          SELECT 1
          FROM clientes
          WHERE id = ${cliente_id}
        ) AS existe;`;
        if (clienteExiste[0]?.existe === false) {
          res.status(404).send({ error: "Cliente no encontrado" });
          return;
        }
      } catch (err) {
        console.log(err);
        res.status(500).send({ error: "Error al verificar el cliente." });
        return;
      }

      let total = 0;
      const itemsConPrecio: {
        producto_id: number;
        cantidad: number;
        precio_unitario: number;
      }[] = [];

      try {
        for (const item of items) {
          const producto =
            await sql`SELECT nombre, precio, stock FROM productos WHERE id = ${item.producto_id}`;

          if (producto.length === 0) {
            res
              .status(404)
              .send({ error: `Producto ${item.producto_id} no encontrado` });
            return;
          }

          if (producto[0].stock < item.cantidad) {
            res.status(400).send({
              error: `Stock insuficiente para el producto ${item.producto_id}`,
            });
            return;
          }

          const precio = producto[0].precio;
          total += precio * item.cantidad;
          itemsConPrecio.push({ ...item, precio_unitario: precio });
        }
      } catch (err) {
        console.log(err);
        res.status(500).send({ error: "Error al verificar los productos" });
        return;
      }

      let pedidoNuevo;
      try {
        [pedidoNuevo] = await sql`
          INSERT INTO pedidos (cliente_id, estado, total)
          VALUES
          (${cliente_id}, 'pendiente', ${total})
          RETURNING *
        `;
        if (!pedidoNuevo) {
          res.status(500).send({ error: "Error al crear el pedido" });
          return;
        }
      } catch (err) {
        console.log(err);
        res.status(500).send({ error: "Error al insertar el pedido" });
        return;
      }

      try {
        for (const item of itemsConPrecio) {
          await sql`
            INSERT INTO pedido_items
            (pedido_id, producto_id, cantidad, precio_unitario)
            VALUES
            (${pedidoNuevo.id}, ${item.producto_id}, ${item.cantidad}, ${item.precio_unitario})
          `;
          await sql`UPDATE productos SET stock = stock - ${item.cantidad} WHERE id = ${item.producto_id}`;
        }
      } catch (err) {
        console.log(err);
        res
          .status(500)
          .send({ error: "Error al insertar los items del pedido" });
        return;
      }

      // El listado de pedidos del cliente quedo desactualizado
      await cacheDel(`clientes:${cliente_id}:pedidos`);
      res.status(201).send(pedidoNuevo);
    },
  );

  // Ruta GET /pedidos/:id
  fastify.get("/pedidos/:id", async (req, res) => {
    let id: number;
    try {
      id = validarId.parse(req.params).id;
    } catch (err) {
      console.error(err);
      res.status(400).send({ error: "Datos invalidos" });
      return;
    }

    const cachedKey = `pedidos:${id}`;
    const cached = await cacheGet(cachedKey);
    if (cached !== null) {
      return res.status(200).send(cached);
    }

    try {
      const [pedido] = await sql`
        SELECT *
        FROM pedidos
        WHERE id = ${id}
      `;
      if (!pedido) {
        res.status(404).send({ error: "Pedido no encontrado" });
        return;
      }
      const items = await sql`
            SELECT pi.producto_id, p.nombre, pi.cantidad, pi.precio_unitario
            FROM pedido_items pi
            JOIN productos p ON p.id = pi.producto_id
            WHERE pi.pedido_id = ${id}
          `;
      await cacheSet(cachedKey, { ...pedido, items: items });
      res.status(200).send({ ...pedido, items: items });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Error al obtener el pedido" });
      return;
    }
  });

  // Ruta PATCH protegida (requiere token)
  fastify.patch(
    "/pedidos/:id/estado",
    { onRequest: [fastify.authenticate] },
    async (req, res) => {
      const { estado } = req.body as { estado: string };

      let id: number;
      try {
        id = validarId.parse(req.params).id;
        actualizarEstadoPedidoSchema.parse(req.body);
      } catch (err) {
        console.error(err);
        res.status(400).send({ error: "Datos invalidos" });
        return;
      }

      let pedido;
      try {
        [pedido] = await sql`SELECT * FROM pedidos WHERE id = ${id}`;
        if (!pedido) {
          res
            .status(404)
            .send({ error: "El pedido no se encuentra registrado" });
          return;
        }
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Error al buscar el pedido" });
        return;
      }

      const permitidos = transicionesValidas[pedido.estado];
      if (!permitidos.includes(estado)) {
        res.status(400).send({
          error: `No se puede pasar de '${pedido.estado}' a '${estado}'`,
        });
        return;
      }

      try {
        const [pedidoActualizado] = await sql`
        UPDATE pedidos SET estado = ${estado} WHERE id = ${id}
        RETURNING id, estado, created_at
      `;
        // El detalle del pedido y el listado del cliente quedaron desactualizados
        await cacheDel(
          `pedidos:${id}`,
          `clientes:${pedido.cliente_id}:pedidos`,
        );
        res.status(200).send(pedidoActualizado);
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ error: "No se pudo actualizar el estado del pedido." });
      }
    },
  );
});
