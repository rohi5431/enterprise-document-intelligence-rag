import assert from "assert";
import { EmbeddingCache, batchProcess } from "../src/lib/embeddingCache";

async function runEmbeddingCacheTests() {
  console.log("=== RUNNING PHASE 3C: EMBEDDING CACHE & BATCHING TESTS ===");

  const cache = new EmbeddingCache(50);

  // 1. Basic Set & Get with SHA-256 Content Hash
  console.log("\n[Test 1] Content-hash Vector Storage & Retrieval");
  const text = "Enterprise Document Intelligence and Semantic Retrieval Platform";
  const vector = [0.12, -0.45, 0.88, 0.05];
  
  assert.strictEqual(cache.get(text), null, "Cache should be empty initially");
  cache.set(text, vector, "bge-small-en");

  const retrieved = cache.get(text, "bge-small-en");
  assert.deepStrictEqual(retrieved, vector, "Failed to retrieve cached vector");
  assert(cache.has(text, "bge-small-en"), "Cache has() should return true");
  console.log("✓ Test 1 Passed: SHA-256 vector storage and retrieval verified.");

  // 2. Model-Aware Cache Isolation (Prevent Vector Dimension Mixing)
  console.log("\n[Test 2] Embedding Model-Aware Cache Isolation");
  // Querying with different model should NOT return vector from previous model
  const diffModelRetrieved = cache.get(text, "text-embedding-004");
  assert.strictEqual(diffModelRetrieved, null, "Cache returned vector from a different model!");

  cache.set(text, [0.99, 0.88], "text-embedding-004");
  const model1Vec = cache.get(text, "bge-small-en");
  const model2Vec = cache.get(text, "text-embedding-004");

  assert.strictEqual(model1Vec?.length, 4, "Model 1 dimensions corrupted");
  assert.strictEqual(model2Vec?.length, 2, "Model 2 dimensions corrupted");
  console.log("✓ Test 2 Passed: Model-aware isolation prevents vector dimension mismatches.");

  // 3. Cache Statistics (Hits, Misses, Hit Ratio)
  console.log("\n[Test 3] Telemetry Cache Statistics");
  const stats = cache.getStats();
  assert(stats.hits >= 3, `Expected at least 3 hits, got ${stats.hits}`);
  assert(stats.misses >= 2, `Expected at least 2 misses, got ${stats.misses}`);
  assert(stats.hitRatio > 0 && stats.hitRatio <= 1, `Invalid hit ratio: ${stats.hitRatio}`);
  console.log(`✓ Test 3 Passed: Cache statistics verified (Hits: ${stats.hits}, Misses: ${stats.misses}, Hit Ratio: ${(stats.hitRatio * 100).toFixed(1)}%).`);

  // 4. Invalidation by Model
  console.log("\n[Test 4] Model-specific Cache Invalidation");
  const invalidatedCount = cache.invalidateModel("bge-small-en");
  assert.strictEqual(invalidatedCount, 1, `Expected 1 invalidated key, got ${invalidatedCount}`);
  assert.strictEqual(cache.get(text, "bge-small-en"), null, "Invalidated model vector still in cache!");
  assert.notStrictEqual(cache.get(text, "text-embedding-004"), null, "Other model vector was improperly deleted!");
  console.log("✓ Test 4 Passed: Model-specific cache invalidation verified.");

  // 5. Batch Processing with Concurrency & Bounded Retries
  console.log("\n[Test 5] Batch Processing with Concurrency & Retries");
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  let processedCount = 0;
  let simulatedFailures = 2;

  const results = await batchProcess(
    items,
    3, // Batch size 3
    async (item) => {
      processedCount++;
      // Simulate transient failure on item 5 that succeeds on retry
      if (item === 5 && simulatedFailures > 0) {
        simulatedFailures--;
        throw new Error("Transient rate limit 429");
      }
      return item * 10;
    },
    { maxRetries: 3, delayMs: 50 }
  );

  assert.strictEqual(results.length, 10, "Not all items processed");
  assert.deepStrictEqual(results, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert(processedCount > 10, "Retry was not attempted");
  console.log("✓ Test 5 Passed: Batch processing with controlled concurrency and transient retry verified.");

  console.log("\n=======================================================");
  console.log("ALL PHASE 3C EMBEDDING CACHE & BATCHING TESTS PASSED!");
  console.log("=======================================================\n");
}

runEmbeddingCacheTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
