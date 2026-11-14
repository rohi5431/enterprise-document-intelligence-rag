import { parseCsvToText, parseMarkdownToText } from "../src/lib/documentParsers";
import { generateParentChildChunks } from "../src/lib/documentProcessor";
import { EmbeddingCache } from "../src/lib/embeddingCache";
import { computeBm25Score, cosineSimilarity } from "../src/lib/retrievalUtils";

interface LatencyStats {
  mean: number;
  median: number;
  p95: number;
  p99: number;
}

function computeStats(samples: number[]): LatencyStats {
  samples.sort((a, b) => a - b);
  const sum = samples.reduce((acc, val) => acc + val, 0);
  const mean = Number((sum / samples.length).toFixed(3));
  const median = Number(samples[Math.floor(samples.length * 0.5)].toFixed(3));
  const p95 = Number(samples[Math.floor(samples.length * 0.95)].toFixed(3));
  const p99 = Number(samples[Math.floor(samples.length * 0.99)].toFixed(3));
  return { mean, median, p95, p99 };
}

async function runBenchmark() {
  console.log("==============================================================");
  console.log("PHASE 5 — REPRODUCIBLE RAG PERFORMANCE BENCHMARK SUITE");
  console.log("==============================================================\n");

  const iterations = 50;

  // 1. Document Extraction & Tabular Parsing
  const rawCsv = "ID,Name,Department,Role,Salary,Bonus,PerformanceRating\n" +
    Array.from({ length: 100 }, (_, i) => `${i + 1},Engineer_${i},AI Systems,Senior Engineer,175000,25000,Exceeds Expectations`).join("\n");
  
  const csvSamples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    parseCsvToText(rawCsv);
    csvSamples.push(performance.now() - t0);
  }
  const csvStats = computeStats(csvSamples);
  console.log(`[1] CSV Tabular Extraction (100 rows): Mean=${csvStats.mean}ms, Median=${csvStats.median}ms, P95=${csvStats.p95}ms`);

  // 2. Parent-Child Chunking
  const sampleDocText = ("ContextRag is an enterprise document intelligence and hybrid RAG platform. " +
    "It uses Qdrant for dense vector search and BM25 for lexical matching. " +
    "Reciprocal Rank Fusion fuses both ranking lists to maximize precision and recall. ").repeat(20);
  
  const chunkingSamples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    generateParentChildChunks(sampleDocText, 101);
    chunkingSamples.push(performance.now() - t0);
  }
  const chunkingStats = computeStats(chunkingSamples);
  console.log(`[2] Parent-Child Chunking: Mean=${chunkingStats.mean}ms, Median=${chunkingStats.median}ms, P95=${chunkingStats.p95}ms`);

  // 3. Embedding Cache Miss vs Cache Hit
  const cache = new EmbeddingCache(5000);
  const sampleVector = Array.from({ length: 384 }, () => Math.random());
  const uniqueQuery = "What are the Q3 financial results for ContextRag enterprise deployment?";

  // Cache Miss (first time)
  const missStart = performance.now();
  const missVal = cache.get(uniqueQuery, "bge-small-en");
  const missDuration = performance.now() - missStart;
  cache.set(uniqueQuery, sampleVector, "bge-small-en");

  // Cache Hit (50 iterations)
  const hitSamples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    cache.get(uniqueQuery, "bge-small-en");
    hitSamples.push(performance.now() - t0);
  }
  const hitStats = computeStats(hitSamples);
  console.log(`[3] Vector Cache Retrieval: Hit Mean=${hitStats.mean}ms, P95=${hitStats.p95}ms (vs external API call ~350ms)`);

  // 4. BM25 Sparse Lexical Scoring
  const corpus = Array.from({ length: 200 }, (_, i) => `Document chunk ${i}: Enterprise artificial intelligence models require low-latency semantic caching and dense indexing.`);
  const bm25Samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    for (const doc of corpus) {
      computeBm25Score(doc, "semantic caching artificial intelligence");
    }
    bm25Samples.push(performance.now() - t0);
  }
  const bm25Stats = computeStats(bm25Samples);
  console.log(`[4] BM25 Lexical Scoring (200 chunks): Mean=${bm25Stats.mean}ms, Median=${bm25Stats.median}ms, P95=${bm25Stats.p95}ms`);

  // 5. Cosine Similarity Dense Vector Search
  const vectorCorpus = Array.from({ length: 500 }, () => Array.from({ length: 384 }, () => Math.random()));
  const queryVec = Array.from({ length: 384 }, () => Math.random());

  const cosineSamples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    for (const v of vectorCorpus) {
      cosineSimilarity(queryVec, v);
    }
    cosineSamples.push(performance.now() - t0);
  }
  const cosineStats = computeStats(cosineSamples);
  console.log(`[5] Dense Vector Cosine Similarity (500 vectors x 384d): Mean=${cosineStats.mean}ms, Median=${cosineStats.median}ms, P95=${cosineStats.p95}ms`);

  // 6. Reciprocal Rank Fusion (RRF)
  const rrfSamples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const vecRanks = Array.from({ length: 50 }, (_, idx) => ({ id: `c_${idx}`, rank: idx + 1 }));
    const bmRanks = Array.from({ length: 50 }, (_, idx) => ({ id: `c_${(idx * 7) % 50}`, rank: idx + 1 }));
    
    const fused = vecRanks.map((vr) => {
      const br = bmRanks.find((b) => b.id === vr.id)?.rank || 100;
      return { id: vr.id, rrf: 1 / (60 + vr.rank) + 1 / (60 + br) };
    });
    fused.sort((a, b) => b.rrf - a.rrf);
    rrfSamples.push(performance.now() - t0);
  }
  const rrfStats = computeStats(rrfSamples);
  console.log(`[6] Hybrid Reciprocal Rank Fusion (RRF 50 candidates): Mean=${rrfStats.mean}ms, Median=${rrfStats.median}ms, P95=${rrfStats.p95}ms`);

  console.log("\n==============================================================");
  console.log("BENCHMARK SUMMARY TABLE:");
  console.log("==============================================================");
  console.log("| Pipeline Operation | Iterations | Mean Latency | Median Latency | P95 Latency | P99 Latency |");
  console.log("|---|---|---|---|---|---|");
  console.log(`| CSV Tabular Parsing (100 rows) | ${iterations} | ${csvStats.mean} ms | ${csvStats.median} ms | ${csvStats.p95} ms | ${csvStats.p99} ms |`);
  console.log(`| Parent-Child Chunking | ${iterations} | ${chunkingStats.mean} ms | ${chunkingStats.median} ms | ${chunkingStats.p95} ms | ${chunkingStats.p99} ms |`);
  console.log(`| Vector Cache Lookup (Hit) | ${iterations} | ${hitStats.mean} ms | ${hitStats.median} ms | ${hitStats.p95} ms | ${hitStats.p99} ms |`);
  console.log(`| BM25 Lexical Scan (200 chunks) | ${iterations} | ${bm25Stats.mean} ms | ${bm25Stats.median} ms | ${bm25Stats.p95} ms | ${bm25Stats.p99} ms |`);
  console.log(`| Dense Similarity (500 vectors x 384d) | ${iterations} | ${cosineStats.mean} ms | ${cosineStats.median} ms | ${cosineStats.p95} ms | ${cosineStats.p99} ms |`);
  console.log(`| Hybrid RRF Fusion (50 candidates) | ${iterations} | ${rrfStats.mean} ms | ${rrfStats.median} ms | ${rrfStats.p95} ms | ${rrfStats.p99} ms |`);
  console.log("==============================================================\n");
}

runBenchmark().catch(console.error);
