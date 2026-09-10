import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { sql } from "../db.ts";
import { signUpSchema, loginSchema } from "../schemas/auth.ts";
import bcrypt from "bcryptjs";
import { cacheGet, cacheSet } from "../redis.ts";

// TTL corto: /auth/me devuelve el rol, no queremos servirlo desactualizado
const ME_TTL = 60;

export default fp(async function auth(fastify: FastifyInstance) {
  // Ruta POST /auth/registro - Crear usuario (hashear password) - No protegida
  fastify.post("/auth/registro", async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    try {
      signUpSchema.parse(req.body);
    } catch (err) {
      console.error(err);
      res.status(400).send({ error: "Datos invalidos" });
      return;
    }

    try {
      const usuario = await sql`SELECT * FROM usuarios WHERE email = ${email}`;
      if (usuario.length > 0) {
        res.status(409).send({ error: "Usuario existente" });
        return;
      }

      const hashPassword = await bcrypt.hash(password, 10);

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
  fastify.post("/auth/login", async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    try {
      await loginSchema.parseAsync(req.body);
    } catch (err) {
      console.error(err);
      res.status(400).send({ error: "Datos invalidos" });
      return;
    }

    try {
      const [usuario] =
        await sql`SELECT * FROM usuarios WHERE email = ${email}`;
      if (!usuario) {
        res.status(401).send({ error: "Credenciales invalidas" });
        return;
      }

      const passwordCorrecto = await bcrypt.compare(
        password,
        usuario.password_hash,
      );

      if (!passwordCorrecto) {
        res.status(401).send({ error: "Credenciales invalidas" });
        return;
      }

      const token = fastify.jwt.sign({
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
  fastify.get(
    "/auth/me",
    { onRequest: [fastify.authenticate] },
    async (req, res) => {
      const cachedKey = `auth:me:${req.user.id}`;
      const cached = await cacheGet(cachedKey);
      if (cached !== null) {
        return res.status(200).send(cached);
      }
      try {
        const [usuario] =
          await sql`SELECT id, email, rol FROM usuarios WHERE id = ${req.user.id}`;
        if (!usuario) {
          res.status(404).send({ error: "Usuario no encontrado" });
          return;
        }
        await cacheSet(cachedKey, usuario, ME_TTL);
        res.status(200).send(usuario);
        return;
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Error al obtener el usuario" });
      }
    },
  );
});
