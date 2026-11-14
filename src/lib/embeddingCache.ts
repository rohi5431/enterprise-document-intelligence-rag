/**
 * High-Performance Embedding Cache and Batching Utilities
 *
 * Avoids generating duplicate embeddings by caching vectors keyed by SHA-256 content hashes
 * and specific embedding model names (preventing dimension/vector space mismatches).
 * Implements chunk batching with controlled concurrency, bounded retries, and telemetry statistics.
 */
import crypto from "crypto";

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRatio: number;
  evictions: number;
}

export class EmbeddingCache {
  private cache = new Map<string, number[]>();
  private readonly maxSize: number;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(maxSize = 10_000) {
    this.maxSize = maxSize;
  }

  hashText(text: string): string {
    return crypto.createHash("sha256").update(text.trim()).digest("hex");
  }

  private makeKey(text: string, model = "default"): string {
    return `${model.toLowerCase()}::${this.hashText(text)}`;
  }

  get(text: string, model = "default"): number[] | null {
    const key = this.makeKey(text, model);
    const val = this.cache.get(key);
    if (val) {
      this.hits++;
      return val;
    }
    this.misses++;
    return null;
  }

  set(text: string, embedding: number[], model = "default"): void {
    if (!embedding || embedding.length === 0) return;
    if (this.cache.size >= this.maxSize) {
      // LRU-style eviction: remove the oldest 500 keys
      const keys = Array.from(this.cache.keys()).slice(0, 500);
      for (const k of keys) this.cache.delete(k);
      this.evictions += keys.length;
    }
    const key = this.makeKey(text, model);
    this.cache.set(key, embedding);
  }

  has(text: string, model = "default"): boolean {
    return this.cache.has(this.makeKey(text, model));
  }

  size(): number {
    return this.cache.size;
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRatio: total > 0 ? Number((this.hits / total).toFixed(4)) : 0,
      evictions: this.evictions,
    };
  }

  invalidateModel(model: string): number {
    const prefix = `${model.toLowerCase()}::`;
    let count = 0;
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }
}

export const embeddingCache = new EmbeddingCache();

/**
 * Concurrently processes an array of items in batches with concurrency control
 * and automatic retry handling for transient failures.
 */
export async function batchProcess<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T, index: number) => Promise<R>,
  options: {
    maxRetries?: number;
    delayMs?: number;
  } = {}
): Promise<R[]> {
  const maxRetries = options.maxRetries ?? 2;
  const delayMs = options.delayMs ?? 300;
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const chunkPromises = chunk.map(async (item, idx) => {
      let attempts = 0;
      while (attempts <= maxRetries) {
        try {
          return await processor(item, i + idx);
        } catch (err) {
          attempts++;
          if (attempts > maxRetries) throw err;
          await new Promise((resolve) => setTimeout(resolve, delayMs * attempts));
        }
      }
      throw new Error(`Failed to process item after ${maxRetries} retries`);
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }
  return results;
}
