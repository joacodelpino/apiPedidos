import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import type { FastifyRequest, FastifyReply } from "fastify";
import { sql } from "./db.ts";
import * as valZod from "./schemas/producto.ts";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();

// Inicializar cliente Fastify (instanciar)
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

// plugin JWT
const fastifySecret = process.env.FASTIFY_SECRET_JWT || "dev-secret";
app.register(fastifyJwt, {
  secret: fastifySecret,
});

// Necesario para que typescript reconozca el decorador
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

// Decorador para autenticacion (hook)
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

app.get("/productos", async (req, res) => {
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

app.get("/productos/:id", async (req, res) => {
  const { id } = req.params as { id: string };

  try {
    await valZod.validarId.parseAsync({ id });
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
app.post("/productos", { onRequest: [app.authenticate] }, async (req, res) => {
  try {
    await valZod.crearProductoSchema.parseAsync(req.body);
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
});

// Ruta DELETE protegida (requiere token)
app.delete(
  "/productos/:id",
  { onRequest: [app.authenticate] },
  async (req, res) => {
    const { id } = req.params as { id: string };

    try {
      await valZod.validarId.parseAsync({ id });
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
app.put(
  "/productos/:id",
  { onRequest: [app.authenticate] },
  async (req, res) => {
    const { id } = req.params as { id: string };

    try {
      await valZod.validarId.parseAsync({ id });
    } catch (err) {
      console.error(err);
      res.status(400).send({ error: "Datos invalidos" });
      return;
    }

    try {
      await valZod.actualizarProductoSchema.parseAsync(req.body);
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

// ============================================
// CLIENTES
// ============================================

// Ruta POST protegida (requiere token)
app.post("/clientes", { onRequest: [app.authenticate] }, async (req, res) => {
  try {
    await valZod.crearClienteSchema.parseAsync(req.body);
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
    // Código 23505 = violación de constraint UNIQUE en PostgreSQL (email duplicado)
    if (err.code === "23505") {
      res.status(409).send({ error: "El email ya está registrado" });
      return;
    }
    res.status(500).send({ error: "Error al insertar el cliente" });
  }
});

app.get("/clientes", async (req, res) => {
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

app.get("/clientes/:id", async (req, res) => {
  const { id } = req.params as { id: string };

  try {
    await valZod.validarId.parseAsync({ id });
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

// ============================================
// PEDIDOS
// ============================================

// POST /pedidos — en progreso: falta envolver en transacción
// (sql.begin) para que la inserción de pedido + items + descuento
// de stock sea todo o nada.

// Ruta POST protegida (requiere token)
app.post("/pedidos", { onRequest: [app.authenticate] }, async (req, res) => {
  // 1. Validar el body
  try {
    await valZod.crearPedidoSchema.parseAsync(req.body);
  } catch (err) {
    console.log(err);
    res.status(400).send({ error: "Datos invalidos" });
    return;
  }

  const { cliente_id, items } = req.body as {
    cliente_id: number;
    items: { producto_id: number; cantidad: number }[];
  };

  // 2. Verificar existencia del cliente
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

  // 3. Verificar cada producto y calcular el total
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

  // 4. Insertar el pedido
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

  // 5. Insertar los items y descontar stock
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
    res.status(500).send({ error: "Error al insertar los items del pedido" });
    return;
  }

  res.status(201).send(pedidoNuevo);
});

// Ruta GET /pedidos/:id
app.get("/pedidos/:id", async (req, res) => {
  const { id } = req.params as { id: string };

  // Validar id ingresado
  try {
    await valZod.validarId.parseAsync({ id });
  } catch (err) {
    console.error(err);
    res.status(400).send({ error: "Datos invalidos" });
    return;
  }

  // Realizar consulta de busqueda
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
    // Buscar los items del pedido con el nombre del producto de paso
    const items = await sql`
          SELECT pi.producto_id, p.nombre, pi.cantidad, pi.precio_unitario
          FROM pedido_items pi
          JOIN productos p ON p.id = pi.producto_id
          WHERE pi.pedido_id = ${id}
        `;
    res.status(200).send({ ...pedido, items: items });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Error al obtener el pedido" });
    return;
  }
});

// Ruta PATCH a /pedidos/:id/estado para cambiar el estado de un pedido, codigo 200/400/404
const transicionesValidas: Record<string, string[]> = {
  pendiente: ["confirmado", "cancelado"],
  confirmado: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

// Ruta PATCH protegida (requiere token)
app.patch(
  "/pedidos/:id/estado",
  { onRequest: [app.authenticate] },
  async (req, res) => {
    const { id } = req.params as { id: string };
    const { estado } = req.body as { estado: string };

    try {
      await valZod.validarId.parseAsync(req.params);
      await valZod.actualizarEstadoPedidoSchema.parseAsync(req.body);
    } catch (err) {
      console.error(err);
      res.status(400).send({ error: "Datos invalidos" });
      return;
    }

    let pedido;
    try {
      [pedido] = await sql`SELECT * FROM pedidos WHERE id = ${id}`;
      if (!pedido) {
        res.status(404).send({ error: "El pedido no se encuentra registrado" });
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
      res.status(200).send(pedidoActualizado);
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .send({ error: "No se pudo actualizar el estado del pedido." });
    }
  },
);

// Ruta GET a /clientes/:id/pedidos, listar pedidos de un cliente CODIGO 200 / 404
app.get("/clientes/:id/pedidos", async (req, res) => {
  const { id } = req.params as { id: string };
  // Validar id
  try {
    await valZod.validarId.parseAsync(req.params);
  } catch (err) {
    console.error(err);
    res.status(400).send({ error: "Datos invalidos" });
    return;
  }
  // Verificar existencia del cliente
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

// Ruta POST /auth/registro - Crear usuario (hashear password) - No protegida

app.post("/auth/registro", async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  // Validar email y contraseña
  try {
    await valZod.signUpSchema.parseAsync(req.body);
  } catch (err) {
    console.error(err);
    res.status(400).send({ error: "Datos invalidos" });
    return;
  }

  // Validar si el usuario ya existe
  try {
    const usuario = await sql`SELECT * FROM usuarios WHERE email = ${email}`;
    if (usuario.length > 0) {
      res.status(409).send({ error: "Usuario existente" });
      return;
    }

    // Hashear password con fastify
    const hashPassword = await bcrypt.hash(password, 10);

    // Insertar password y email en la db
    try {
      const [usuario] = await sql`INSERT INTO usuarios (email, password_hash)
        VALUES (${email}, ${hashPassword})
        RETURNING id, email, created_at`;
      res.status(201).send(usuario);
      return;
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Error al insertar el usuario" });
      return;
    }
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Error al verificar el usuario" });
    return;
  }
});

// Ruta POST /auth/login - Validar credenciales y devolver JWT - No protegida
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  // Validar body (email y password)
  try {
    await valZod.loginSchema.parseAsync(req.body);
  } catch (err) {
    console.error(err);
    res.status(400).send({ error: "Datos invalidos" });
    return;
  }

  // Verificar que el usuario esta registrado
  try {
    const [usuario] = await sql`SELECT * FROM usuarios WHERE email = ${email}`;
    if (!usuario) {
      res.status(401).send({ error: "Credenciales invalidas" });
      return;
    }

    // Validar password
    const passwordCorrecto = await bcrypt.compare(
      password,
      usuario.password_hash,
    );

    if (!passwordCorrecto) {
      res.status(401).send({ error: "Credenciales invalidas" });
      return;
    }

    // Crear token de acceso
    const token = app.jwt.sign({
      id: usuario.id,
      rol: usuario.rol,
    });

    res.status(200).send({ token });
    return;
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Error al iniciar sesion" });
    return;
  }
});

// Ruta GET /auth/me - Devolver datos del usuario logueado - Protegida
app.get("/auth/me", { onRequest: [app.authenticate] }, async (req, res) => {
  try {
    const [usuario] =
      await sql`SELECT id, email, rol FROM usuarios WHERE id = ${req.user.id}`;
    res.status(200).send(usuario);
    return;
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Error al obtener el usuario" });
  }
});

app.listen({ port: 3000 }, (err, address) => {
  console.log(`Server is now listening on ${address}`);
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
