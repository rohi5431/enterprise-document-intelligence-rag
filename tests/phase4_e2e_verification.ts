process.env.TEST_MODE = "true";
process.env.NODE_ENV = "test";

import assert from "assert";
import { EventEmitter } from "events";
import { app, db } from "../contextRag";
import { hashPassword, verifyPassword, generateAccessToken, verifyAccessToken } from "../src/lib/authUtils";
import { validateUploadedFile, parseCsvToText, parseMarkdownToText } from "../src/lib/documentParsers";
import { EmbeddingCache, batchProcess } from "../src/lib/embeddingCache";
import { CentralizedLLMService, classifyQueryComplexity } from "../src/lib/llmRouting";
import { computeBm25Score, cosineSimilarity } from "../src/lib/retrievalUtils";

function invokeApp(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve) => {
    const req: any = new EventEmitter();
    req.method = method.toUpperCase();
    req.url = url;
    req.originalUrl = url;
    req.headers = {};
    for (const [k, v] of Object.entries(headers)) {
      req.headers[k.toLowerCase()] = v;
    }
    if (body) {
      req.headers["content-type"] = "application/json";
      req.body = body;
    } else {
      req.body = {};
    }

    let statusCode = 200;
    const resHeaders: Record<string, string> = {};
    let responseBody = "";

    const res: any = new EventEmitter();
    res.statusCode = statusCode;
    res.status = (code: number) => {
      statusCode = code;
      res.statusCode = code;
      return res;
    };
    res.setHeader = (key: string, val: string) => {
      resHeaders[key.toLowerCase()] = String(val);
      return res;
    };
    res.getHeader = (key: string) => resHeaders[key.toLowerCase()];
    res.json = (data: any) => {
      resolve({ status: statusCode, body: data, headers: resHeaders });
      return res;
    };
    res.send = (data: any) => {
      let parsed = data;
      try {
        parsed = JSON.parse(data);
      } catch {}
      resolve({ status: statusCode, body: parsed, headers: resHeaders });
      return res;
    };
    res.end = (chunk?: any) => {
      if (chunk) responseBody += chunk;
      let parsed = responseBody;
      try {
        parsed = JSON.parse(responseBody);
      } catch {}
      resolve({ status: statusCode, body: parsed, headers: resHeaders });
      return res;
    };

    (app as any).handle(req, res, (err: any) => {
      if (err) {
        resolve({ status: 500, body: { error: String(err) }, headers: resHeaders });
      } else {
        resolve({ status: 404, body: { error: "Not found" }, headers: resHeaders });
      }
    });
  });
}

async function runE2ESuite() {
  console.log("==============================================================");
  console.log("PHASE 4J — COMPLETE END-TO-END SYSTEM INTEGRATION SUITE");
  console.log("==============================================================\n");

  // STAGE 1: Container Liveness & Readiness Probes
  console.log("[Stage 1] Probing Container Health & Readiness");
  const liveness = await invokeApp("GET", "/health");
  assert.strictEqual(liveness.status, 200, "Liveness probe failed");
  assert.strictEqual(liveness.body.status, "ok");

  const readiness = await invokeApp("GET", "/ready");
  assert.strictEqual(readiness.status, 200, "Readiness probe failed");
  assert.strictEqual(readiness.body.status, "ready");
  console.log("✓ Stage 1 Passed: Container liveness (/health) and readiness (/ready) verified.");

  // STAGE 2: Authentication & Account Takeover Prevention
  console.log("\n[Stage 2] User Registration, Conflict Guard & Scrypt Password Hashing");
  const email = `e2e_${Date.now()}@contextrag.com`;
  const originalPwd = "SecureMasterPassword2026!";

  const regRes = await invokeApp("POST", "/api/v1/auth/register", {}, {
    email,
    password: originalPwd,
    full_name: "E2E Tester",
  });
  assert.strictEqual(regRes.status, 201, "User registration failed");

  // Duplicate registration must return 409 Conflict
  const dupRes = await invokeApp("POST", "/api/v1/auth/register", {}, {
    email,
    password: "AttackerPasswordOverriding!",
    full_name: "Attacker",
  });
  assert.strictEqual(dupRes.status, 409, "Duplicate registration was not rejected with 409 Conflict!");

  // Verify login with original credentials and signed token issuance
  const loginRes = await invokeApp("POST", "/api/v1/auth/login", {}, {
    email,
    password: originalPwd,
  });
  assert.strictEqual(loginRes.status, 200, "Login failed for valid credentials");
  assert(loginRes.body.access_token.startsWith("cr_"), "Token format is not signed cr_ prefix");
  const userToken = loginRes.body.access_token;

  // Verify attacker login fails
  const attackerLogin = await invokeApp("POST", "/api/v1/auth/login", {}, {
    email,
    password: "AttackerPasswordOverriding!",
  });
  assert.strictEqual(attackerLogin.status, 401, "Attacker password was accepted! Password overwrite occurred!");
  console.log("✓ Stage 2 Passed: User registered with scrypt hash, duplicate conflict 409 guarded, signed token issued.");

  // STAGE 3: Administrative Access & Privilege Escalation Guard
  console.log("\n[Stage 3] Administrative RBAC & Privilege Escalation Protection");
  const unauthReq = await invokeApp("GET", "/api/v1/admin/users");
  assert.strictEqual(unauthReq.status, 401, "Unauthenticated request should return 401");

  const nonAdminReq = await invokeApp("GET", "/api/v1/admin/users", {
    Authorization: `Bearer ${userToken}`,
  });
  assert.strictEqual(nonAdminReq.status, 403, "Non-admin request should return 403");

  const demoBypassReq = await invokeApp("GET", "/api/v1/admin/users", {
    Authorization: `Bearer ${userToken}`,
    "x-demo-mode": "true",
  });
  assert.strictEqual(demoBypassReq.status, 403, "Fake demo header bypass succeeded! Must return 403");

  // Admin access
  const adminReq = await invokeApp("GET", "/api/v1/admin/users", {
    Authorization: "Bearer mock-token-1",
  });
  assert.strictEqual(adminReq.status, 200, "Admin access failed");
  console.log("✓ Stage 3 Passed: Administrative RBAC verified; demo header bypass completely blocked.");

  // STAGE 4: Document Intelligence & Validation
  console.log("\n[Stage 4] Document Processing, Format Validation & Deduplication");
  const validCsv = "Product,Category,Price\nContextRag Enterprise,Software,25000\nVector Storage,Infrastructure,12000";
  const validCsvBuf = Buffer.from(validCsv, "utf-8");
  const validation = validateUploadedFile("products.csv", validCsvBuf, "text/csv");
  assert(validation.valid, "Valid CSV failed validation");
  assert(validation.contentHash, "Missing content hash");

  const parsedTable = parseCsvToText(validCsv);
  assert(parsedTable.includes("| Product | Category | Price |"), "Parsed CSV missing table headers");
  assert(parsedTable.includes("ContextRag Enterprise"), "Parsed CSV missing row values");

  const exeCheck = validateUploadedFile("exploit.exe", Buffer.from("MZ"), "application/x-msdownload");
  assert(!exeCheck.valid, "Executable file was accepted!");
  console.log("✓ Stage 4 Passed: File validation, structured tabular parsing, and malware rejection verified.");

  // STAGE 5: Multi-Provider LLM Routing & Fallback
  console.log("\n[Stage 5] Multi-Provider LLM Routing & Complexity Classification");
  const normalClass = classifyQueryComplexity("What are the quarterly financial results?");
  assert.strictEqual(normalClass.complexity, "normal", "Normal query misclassified");

  const complexClass = classifyQueryComplexity("Compare and contrast vector indexing against graph databases with step-by-step tradeoffs.");
  assert.strictEqual(complexClass.complexity, "complex", "Complex query misclassified");

  const router = new CentralizedLLMService();
  const normalRoute = router.getRoutingSequence("normal");
  assert.deepStrictEqual(normalRoute, ["groq", "gemini", "ollama"], "Incorrect normal priority sequence");

  const complexRoute = router.getRoutingSequence("complex");
  assert.deepStrictEqual(complexRoute, ["gemini", "groq", "ollama"], "Incorrect complex priority sequence");
  console.log("✓ Stage 5 Passed: Query complexity classification and prioritized routing sequences verified.");

  // STAGE 6: Model-Aware Embedding Cache
  console.log("\n[Stage 6] Model-Aware Vector Caching & Isolation");
  const cache = new EmbeddingCache();
  const sampleText = "Semantic dense retrieval benchmark";
  cache.set(sampleText, [0.1, 0.2, 0.3], "nomic-embed-text");

  assert.strictEqual(cache.get(sampleText, "gemini-embedding-001"), null, "Cache returned vector from wrong model!");
  assert.deepStrictEqual(cache.get(sampleText, "nomic-embed-text"), [0.1, 0.2, 0.3]);
  console.log("✓ Stage 6 Passed: Model-aware embedding cache prevents dimension corruption.");

  // STAGE 7: SSRF Guard on URL Ingestion
  console.log("\n[Stage 7] SSRF Validation on URL Document Ingestion");
  const ssrfAttempts = [
    "http://127.0.0.1:8000/internal",
    "http://localhost:3000/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://192.168.1.1/router",
    "http://10.0.0.1/db",
  ];
  for (const badUrl of ssrfAttempts) {
    const res = await invokeApp("POST", "/api/v1/documents/import-url", {
      Authorization: `Bearer ${userToken}`,
    }, { url: badUrl });
    assert.strictEqual(res.status, 400, `SSRF request to ${badUrl} was not blocked! Got status ${res.status}`);
  }
  console.log("✓ Stage 7 Passed: Private IPv4, AWS metadata, and localhost SSRF vectors blocked.");

  console.log("\n==============================================================");
  console.log("ALL 7 STAGES OF THE END-TO-END VERIFICATION SUITE PASSED!");
  console.log("==============================================================\n");
  process.exit(0);
}

runE2ESuite().catch((err) => {
  console.error("E2E Test Failed:", err);
  process.exit(1);
});
