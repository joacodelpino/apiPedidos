import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

export const DEF_TTL = 3600; // 1 hora

// Unica instancia de cliente Redis
export const redis = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    enableOfflineQueue: false, // falla rapido en vez de encolar y colgar la request
    maxRetriesPerRequest: 1,
  },
);

// Excepciones de redis
redis.on("error", (err) => {
  console.error("[ioredis] Error de conexión:", err.message);
});

/* Lee del cache. Si Redis falla, devuelve null y la ruta va a la DB. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch (err) {
    console.error("[cache] get falló:", key, (err as Error).message);
    return null;
  }
}

/** Escribe en el cache. Si Redis falla, no rompe la respuesta. */
export async function cacheSet(key: string, value: unknown, ttl = DEF_TTL) {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
  } catch (err) {
    console.error("[cache] set falló:", key, (err as Error).message);
  }
}

/** Invalida una o mas keys. Si Redis falla, no rompe la respuesta. */
export async function cacheDel(...keys: string[]) {
  try {
    if (keys.length > 0) await redis.del(...keys);
  } catch (err) {
    console.error("[cache] del falló:", keys, (err as Error).message);
  }
}
