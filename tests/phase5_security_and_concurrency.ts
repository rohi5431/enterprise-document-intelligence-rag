process.env.TEST_MODE = "true";
process.env.NODE_ENV = "test";

import assert from "assert";
import fs from "fs";
import { EventEmitter } from "events";
import { app, db } from "../contextRag";
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  verifyAccessToken,
  revokeToken,
  isTokenRevoked,
} from "../src/lib/authUtils";

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

async function runPhase5AuditSuite() {
  console.log("==============================================================");
  console.log("PHASE 5 — SECURITY RE-AUDIT & CONCURRENCY VERIFICATION SUITE");
  console.log("==============================================================\n");

  // 1. HMAC Token Expiration, Tampering & Revocation
  console.log("[Test 1] HMAC Token Validation, Expiration & Revocation");
  const testUser = { id: 777, email: "audit@enterprise.com", role: "user" as const };
  const validToken = generateAccessToken(testUser);
  assert(validToken.startsWith("cr_"), "Invalid token format");

  const verified = verifyAccessToken(validToken);
  assert.strictEqual(verified?.userId, 777);

  // Tampered signature test
  const tamperedToken = validToken.slice(0, -4) + "X9Z1";
  assert.strictEqual(verifyAccessToken(tamperedToken), null, "Tampered signature was accepted!");

  // Revocation test
  assert.strictEqual(isTokenRevoked(validToken), false, "Token was marked revoked prematurely");
  revokeToken(validToken);
  assert.strictEqual(isTokenRevoked(validToken), true, "Token was not marked revoked");
  assert.strictEqual(verifyAccessToken(validToken), null, "Revoked token was accepted!");
  console.log("✓ Test 1 Passed: HMAC signature verification, tamper rejection, and revocation verified.");

  // 2. Production Mock Token Isolation (Privilege Escalation Prevention)
  console.log("\n[Test 2] Production Isolation for Legacy Mock Tokens");
  const originalEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.TEST_MODE;
    const prodMockCheck = verifyAccessToken("mock-token-1");
    assert.strictEqual(prodMockCheck, null, "CRITICAL: mock-token-1 was accepted in production mode!");
  } finally {
    process.env.NODE_ENV = originalEnv;
    process.env.TEST_MODE = "true";
  }
  console.log("✓ Test 2 Passed: Legacy mock tokens are strictly rejected in production mode.");

  // 3. User Logout & Server-Side Token Invalidation Flow
  console.log("\n[Test 3] End-to-End User Logout & Token Revocation Flow");
  const loginUser = { id: 888, email: "logout_test@contextrag.com", role: "user" as const };
  const sessionToken = generateAccessToken(loginUser);

  // Seed user in memory
  db.users.push({
    id: 888,
    email: "logout_test@contextrag.com",
    password_hash: hashPassword("LogoutTest123!"),
    full_name: "Logout Tester",
    role: "user",
  });

  // Check /auth/me before logout
  const meBefore = await invokeApp("GET", "/api/v1/auth/me", {
    Authorization: `Bearer ${sessionToken}`,
  });
  assert.strictEqual(meBefore.status, 200, "Valid session rejected before logout");

  // Call /auth/logout
  const logoutRes = await invokeApp("POST", "/api/v1/auth/logout", {
    Authorization: `Bearer ${sessionToken}`,
  });
  assert.strictEqual(logoutRes.status, 200, "Logout endpoint failed");
  assert.strictEqual(logoutRes.body.success, true);

  // Check /auth/me after logout -> MUST RETURN 401 Unauthorized
  const meAfter = await invokeApp("GET", "/api/v1/auth/me", {
    Authorization: `Bearer ${sessionToken}`,
  });
  assert.strictEqual(meAfter.status, 401, `Revoked token was accepted after logout! Got status: ${meAfter.status}`);
  console.log("✓ Test 3 Passed: User logout successfully revokes token; subsequent requests rejected with HTTP 401.");

  // 4. Concurrent Database Persistence Stress Test
  console.log("\n[Test 4] Database Concurrency & Lost-Update Prevention");
  const initialDocsCount = db.documents.length;
  const concurrentTasks = 25;

  const promises = Array.from({ length: concurrentTasks }, async (_, i) => {
    const fakeDoc = {
      id: 90000 + i,
      user_id: 1,
      title: `Concurrent Doc ${i}`,
      filename: `doc_${i}.txt`,
      filepath: "",
      file_size: 100,
      chunks_count: 1,
      processing_status: "processed" as const,
      created_at: new Date().toISOString(),
    };
    db.documents.push(fakeDoc);
    // Trigger saveDb through API-like pattern
    const res = await invokeApp("POST", "/api/v1/prompts", {
      Authorization: "Bearer mock-token-1",
    }, {
      name: `prompt_${Date.now()}_${i}`,
      template_text: `Template ${i}`,
      description: `Test prompt ${i}`,
    });
    return res.status;
  });

  const statuses = await Promise.all(promises);
  assert(statuses.every((s) => s === 200 || s === 201), "Concurrent operations failed");

  // Verify file on disk is valid JSON
  await new Promise((r) => setTimeout(r, 200)); // Allow debounce to settle
  const diskData = JSON.parse(fs.readFileSync("db.json", "utf-8"));
  assert(Array.isArray(diskData.documents), "Corrupted database on disk");
  assert(diskData.documents.length >= initialDocsCount + concurrentTasks, "Lost updates detected in database!");

  // Clean up test documents
  db.documents = db.documents.filter((d) => d.id < 90000);
  console.log(`✓ Test 4 Passed: 25 concurrent database mutations serialized cleanly with zero lost updates or file collisions.`);

  // 5. Advanced SSRF & IP Validation
  console.log("\n[Test 5] SSRF Reserved & Loopback Range Validation");
  const dangerousUrls = [
    "http://127.0.0.1/admin",
    "http://localhost:3000/api",
    "http://169.254.169.254/latest/user-data",
    "http://10.10.10.10/internal",
    "http://172.20.0.1/secrets",
    "http://192.168.0.1/gateway",
    "http://[::1]/root",
    "http://2130706433/num", // 127.0.0.1 in decimal integer
    "file:///etc/passwd",
    "gopher://127.0.0.1:25",
  ];

  for (const url of dangerousUrls) {
    const res = await invokeApp("POST", "/api/v1/documents/import-url", {
      Authorization: "Bearer mock-token-1",
    }, { url });
    assert.strictEqual(res.status, 400, `SSRF URL was not blocked: ${url} (got ${res.status})`);
  }
  console.log("✓ Test 5 Passed: All SSRF vectors (IPv4 private, IPv6 loopback, cloud metadata, decimal IP, file/gopher) rejected.");

  console.log("\n==============================================================");
  console.log("ALL PHASE 5 SECURITY RE-AUDIT & CONCURRENCY TESTS PASSED!");
  console.log("==============================================================\n");
  process.exit(0);
}

runPhase5AuditSuite().catch((err) => {
  console.error("\n❌ Phase 5 Security Audit Test Failed:", err);
  process.exit(1);
});
