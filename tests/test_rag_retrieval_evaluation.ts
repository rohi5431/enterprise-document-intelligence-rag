import assert from "assert";
import { computeBm25Score, cosineSimilarity } from "../src/lib/retrievalUtils";

interface TestChunk {
  id: string;
  doc_id: number;
  user_id: number;
  text: string;
  page_number: number;
  parent_id?: string;
  embedding: number[];
}

interface TestDoc {
  id: number;
  user_id: number;
  title: string;
  filename: string;
}

// Simulated Corpus
const testDocs: TestDoc[] = [
  { id: 101, user_id: 1, title: "Q3 Financial Report", filename: "financial_report.pdf" },
  { id: 102, user_id: 1, title: "Engineering System Architecture", filename: "architecture.docx" },
  { id: 103, user_id: 1, title: "Employee Compensation Matrix", filename: "salary_table.csv" },
  { id: 201, user_id: 2, title: "Confidential Competitor Analysis", filename: "secret_report.pdf" },
];

const testChunks: TestChunk[] = [
  // Doc 101: Financial (Multi-page)
  {
    id: "c1_p1",
    doc_id: 101,
    user_id: 1,
    page_number: 1,
    text: "ContextRag Q3 gross revenue reached $14.2M, representing an annualized growth of 42%.",
    embedding: [0.9, 0.1, 0.0, 0.0],
  },
  {
    id: "c1_p2",
    doc_id: 101,
    user_id: 1,
    page_number: 2,
    text: "Operating expenditures for Q3 were $8.1M, primarily driven by R&D infrastructure and cloud GPUs.",
    embedding: [0.85, 0.2, 0.0, 0.0],
  },
  // Doc 102: Architecture
  {
    id: "c2_child1",
    doc_id: 102,
    user_id: 1,
    page_number: 1,
    parent_id: "c2_parent1",
    text: "Qdrant handles dense vector indexing with HNSW cosine similarity graphs.",
    embedding: [0.0, 0.95, 0.1, 0.0],
  },
  {
    id: "c2_parent1",
    doc_id: 102,
    user_id: 1,
    page_number: 1,
    text: "[Full Section Architecture] ContextRag employs a hybrid retrieval pipeline. Qdrant handles dense vector indexing with HNSW cosine similarity graphs, while in-memory BM25 handles sparse lexical indexing for exact acronym and terminology matching.",
    embedding: [],
  },
  // Doc 103: Tabular Content (from parsed CSV)
  {
    id: "c3_table1",
    doc_id: 103,
    user_id: 1,
    page_number: 1,
    text: "| Employee | Department | Base Salary | Bonus |\n| Alice Johnson | AI Research | $185,000 | $25,000 |\n| Bob Smith | Cloud DevOps | $165,000 | $20,000 |",
    embedding: [0.1, 0.1, 0.95, 0.0],
  },
  // Doc 201: Other user's confidential document
  {
    id: "c4_unauth",
    doc_id: 201,
    user_id: 2,
    page_number: 1,
    text: "Confidential Project Titan roadmap: Acquisition target is BetaCorp for $45M.",
    embedding: [0.95, 0.0, 0.0, 0.0],
  },
];

function retrieveForUser(
  query: string,
  queryVector: number[],
  userId: number,
  targetDocIds?: number[],
  topK = 5
) {
  // 1. Strict Tenant & Document Boundary Filter
  const allowedDocIds = new Set(
    testDocs
      .filter((d) => d.user_id === userId && (!targetDocIds || targetDocIds.includes(d.id)))
      .map((d) => d.id)
  );

  const eligibleChunks = testChunks.filter((c) => allowedDocIds.has(c.doc_id));

  // 2. Hybrid Scoring (Vector + BM25)
  const scored = eligibleChunks.map((chunk) => {
    const vecScore = cosineSimilarity(queryVector, chunk.embedding);
    const bm25Score = computeBm25Score(chunk.text, query);
    return { chunk, vecScore, bm25Score };
  });

  // 3. Reciprocal Rank Fusion (RRF)
  scored.sort((a, b) => b.vecScore - a.vecScore);
  const vecRanks = new Map<string, number>();
  scored.forEach((item, idx) => vecRanks.set(item.chunk.id, idx + 1));

  scored.sort((a, b) => b.bm25Score - a.bm25Score);
  const bmRanks = new Map<string, number>();
  scored.forEach((item, idx) => bmRanks.set(item.chunk.id, idx + 1));

  const fused = scored.map((item) => {
    const vr = vecRanks.get(item.chunk.id) || 100;
    const br = bmRanks.get(item.chunk.id) || 100;
    const rrf = 1 / (60 + vr) + 1 / (60 + br);
    return { ...item, rrf };
  });

  fused.sort((a, b) => b.rrf - a.rrf);

  // 4. Parent-Child Resolution
  const resolved = fused.slice(0, topK).map((item) => {
    let text = item.chunk.text;
    if (item.chunk.parent_id) {
      const parent = testChunks.find((c) => c.id === item.chunk.parent_id);
      if (parent) text = parent.text;
    }
    const doc = testDocs.find((d) => d.id === item.chunk.doc_id);
    return {
      chunk_id: item.chunk.id,
      doc_id: item.chunk.doc_id,
      doc_title: doc?.title,
      page_number: item.chunk.page_number,
      text_snippet: text,
      score: item.rrf,
      vectorScore: item.vecScore,
      bm25Score: item.bm25Score,
    };
  });

  return resolved;
}

async function runRetrievalOptimizationTests() {
  console.log("=== RUNNING PHASE 3D: RAG RETRIEVAL OPTIMIZATION EVALUATION ===");

  // Case 1: Simple Factual Question
  console.log("\n[Case 1] Simple Factual Retrieval");
  const q1 = "What was the gross revenue in Q3?";
  const v1 = [0.92, 0.05, 0.0, 0.0];
  const r1 = retrieveForUser(q1, v1, 1);
  assert(r1.length > 0, "No results returned for factual query");
  assert.strictEqual(r1[0].doc_id, 101, "Top document should be Q3 Financial Report");
  assert(r1[0].text_snippet.includes("$14.2M"), "Top chunk missing factual revenue answer");
  console.log(`✓ Case 1 Passed: Simple factual question retrieved target chunk (Score: ${r1[0].score.toFixed(4)}).`);

  // Case 2: Multi-Page Citation Preservation
  console.log("\n[Case 2] Multi-Page Citation Preservation");
  const q2 = "What were the operating expenditures in Q3?";
  const v2 = [0.88, 0.15, 0.0, 0.0];
  const r2 = retrieveForUser(q2, v2, 1);
  const p2Chunk = r2.find((c) => c.text_snippet.includes("Operating expenditures"));
  assert(p2Chunk, "Page 2 chunk missing from retrieval");
  assert.strictEqual(p2Chunk.page_number, 2, "Page number 2 not preserved");
  console.log(`✓ Case 2 Passed: Page-level citation preserved (Page ${p2Chunk.page_number}).`);

  // Case 3: Tabular Content Retrieval (from CSV)
  console.log("\n[Case 3] Structured Tabular Content Retrieval");
  const q3 = "What is Alice Johnson's base salary in AI Research?";
  const v3 = [0.08, 0.1, 0.92, 0.0];
  const r3 = retrieveForUser(q3, v3, 1);
  assert(r3.length > 0, "No results returned for tabular query");
  assert(r3[0].text_snippet.includes("Alice Johnson"), "Table row missing Alice Johnson");
  assert(r3[0].text_snippet.includes("$185,000"), "Table row missing base salary");
  console.log("✓ Case 3 Passed: Tabular structured content correctly ranked and retrieved.");

  // Case 4: Parent-Child Chunk Expansion
  console.log("\n[Case 4] Parent-Child Context Resolution");
  const q4 = "How does Qdrant handle dense vector search?";
  const v4 = [0.0, 0.94, 0.05, 0.0];
  const r4 = retrieveForUser(q4, v4, 1);
  assert(r4[0].chunk_id === "c2_child1", "Child chunk should match vector query");
  assert(r4[0].text_snippet.includes("[Full Section Architecture]"), "Child chunk was not expanded to parent context!");
  console.log("✓ Case 4 Passed: Child vector hit correctly expanded to full parent context.");

  // Case 5: Document Access Control & Tenant Isolation
  console.log("\n[Case 5] Strict Tenant & Document Boundary Isolation");
  const q5 = "What is the secret acquisition target in Project Titan?";
  const v5 = [0.96, 0.0, 0.0, 0.0]; // Highly similar to unauthorized chunk c4_unauth!
  const r5User1 = retrieveForUser(q5, v5, 1);
  assert(!r5User1.some((c) => c.doc_id === 201), "CRITICAL LEAK: User 1 retrieved User 2's confidential document!");
  assert(!r5User1.some((c) => c.text_snippet.includes("BetaCorp")), "Confidential target leaked to unauthorized user!");
  console.log("✓ Case 5 Passed: Cross-tenant unauthorized document retrieval strictly blocked.");

  // Case 6: Unanswerable Question / No Supporting Evidence Detection
  console.log("\n[Case 6] Out-of-Domain Unanswerable Question");
  const q6 = "What is the quantum teleportation protocol across black hole horizons?";
  const v6 = [0.0, 0.0, 0.0, 0.99]; // Completely orthogonal vector
  const r6 = retrieveForUser(q6, v6, 1);
  const maxVectorScore = Math.max(...r6.map((c) => c.vectorScore), 0);
  assert(maxVectorScore < 0.2, `Vector score should be low for out-of-domain query, got ${maxVectorScore}`);
  console.log(`✓ Case 6 Passed: Unanswerable query correctly detected with low vector similarity (${maxVectorScore.toFixed(3)}).`);

  console.log("\n=======================================================");
  console.log("ALL PHASE 3D RAG RETRIEVAL OPTIMIZATION TESTS PASSED!");
  console.log("=======================================================\n");
}

runRetrievalOptimizationTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
