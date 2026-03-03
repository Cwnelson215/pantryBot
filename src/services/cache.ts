import { LRUCache } from "lru-cache";

const HOUR = 1000 * 60 * 60;
const DAY = HOUR * 24;

export const TTL = {
  SHORT: DAY,           // 24 hours — recipe search, AI generation
  MEDIUM: 7 * DAY,      // 7 days — food search
  LONG: 30 * DAY,       // 30 days — recipe details, barcode lookups
  VERY_LONG: 90 * DAY,  // 90 days — USDA food details (rarely change)
} as const;

const allCaches: LRUCache<string, any>[] = [];

export function createCache<V extends {}>(options: { max: number; ttl: number }) {
  const cache = new LRUCache<string, V>({ max: options.max, ttl: options.ttl });
  allCaches.push(cache);
  return cache;
}

export function clearAllCaches() {
  for (const cache of allCaches) {
    cache.clear();
  }
}
