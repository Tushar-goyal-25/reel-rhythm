import { Redis } from "@upstash/redis";

const memoryStore = new Map<string, unknown>();

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

function redis() {
  const config = redisConfig();
  return config ? new Redis(config) : null;
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
