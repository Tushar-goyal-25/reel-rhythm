import { Redis } from "@upstash/redis";

const memoryStore = new Map<string, unknown>();

/** First name that holds a non-blank value. */
function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

function redisConfig() {
  // Vercel's Upstash integration creates the KV_REST_API_* pair. A manually added
  // UPSTASH_REDIS_REST_* pair left blank must not shadow it, which is why these are
  // resolved by first non-empty value rather than by ?? (an empty string is not nullish).
  const url = envValue("UPSTASH_REDIS_REST_URL", "KV_REST_API_URL");
  const token = envValue("UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN");
  return url && token ? { url, token } : null;
}

function redis() {
  const config = redisConfig();
  return config ? new Redis(config) : null;
}

/**
 * Whether values survive beyond the current server process. Without Redis the
 * fallback store is a module-level Map, so anything written by one serverless
 * invocation is invisible to the next one.
 */
export function hasDurableStorage() {
  return redisConfig() !== null;
}

export type StorageHealth = { configured: boolean; reachable: boolean; error?: string };

/**
 * Presence of the environment variables is not proof that Redis works: a REST
 * URL pointing at the wrong host still reads as configured, and readStored
 * then falls back to memory without saying so. Ask Redis directly.
 */
export async function checkStorage(): Promise<StorageHealth> {
  const client = redis();
  if (!client) return { configured: false, reachable: false };

  try {
    await client.ping();
    return { configured: true, reachable: true };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      error: error instanceof Error ? error.message : "Redis did not answer.",
    };
  }
}

export async function readStored<T>(key: string, fallback: T): Promise<T> {
  const client = redis();
  if (client) {
    try {
      return (await client.get<T>(key)) ?? fallback;
    } catch (error) {
      console.error(`Could not read ${key} from Redis`, error);
    }
  }

  return (memoryStore.get(key) as T | undefined) ?? fallback;
}

export async function writeStored<T>(key: string, value: T): Promise<void> {
  const client = redis();
  if (client) {
    try {
      await client.set(key, value);
      return;
    } catch (error) {
      console.error(`Could not write ${key} to Redis`, error);
    }
  }

  memoryStore.set(key, value);
}
