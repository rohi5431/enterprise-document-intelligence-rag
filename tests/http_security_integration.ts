process.env.TEST_MODE = "true";
process.env.NODE_ENV = "test";

import assert from "assert";
import { EventEmitter } from "events";
import { app, db } from "../contextRag";

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

async function run() {
  console.log("=== PHASE 2 HTTP & SECURITY INTEGRATION SUITE ===");

  // TEST 1: Register new user
  console.log("\n[Test 1] Registration of new user");
  const testEmail = `test_${Date.now()}@securitytest.com`;
  const originalPassword = "InitialSecurePassword999!";
  const regRes = await invokeApp("POST", "/api/v1/auth/register", {}, {
    email: testEmail,
    password: originalPassword,
    full_name: "Security Tester",
  });
  assert.strictEqual(regRes.status, 201, `Expected 201 Created, got ${regRes.status}: ${JSON.stringify(regRes.body)}`);
  console.log("✓ Test 1 Passed: Successfully registered new user (HTTP 201).");

  // TEST 2: Duplicate registration rejected with 409 Conflict (SEC-02)
  console.log("\n[Test 2] SEC-02: Duplicate registration must return HTTP 409 Conflict");
  const dupRes = await invokeApp("POST", "/api/v1/auth/register", {}, {
    email: testEmail,
    password: "AttackerAttemptedOverwritePassword666!",
    full_name: "Attacker Impersonator",
  });
  assert.strictEqual(dupRes.status, 409, `Expected 409 Conflict on duplicate registration, got ${dupRes.status}`);
  console.log("✓ Test 2 Passed: Duplicate registration returned HTTP 409 Conflict.");

  // TEST 3: Original user password preserved (SEC-02: No Account Takeover)
  console.log("\n[Test 3] SEC-02: Verify original password was NOT overwritten");
  const loginOriginalRes = await invokeApp("POST", "/api/v1/auth/login", {}, {
    email: testEmail,
    password: originalPassword,
  });
  assert.strictEqual(loginOriginalRes.status, 200, "Original user login failed after duplicate registration attempt!");
  assert(loginOriginalRes.body.access_token, "Missing access_token in login response");
  assert(loginOriginalRes.body.access_token.startsWith("cr_"), "Token must be cryptographic cr_ format");
  const userToken = loginOriginalRes.body.access_token;

  // Verify attacker's password does NOT work
  const loginAttackerRes = await invokeApp("POST", "/api/v1/auth/login", {}, {
    email: testEmail,
    password: "AttackerAttemptedOverwritePassword666!",
  });
  assert.strictEqual(loginAttackerRes.status, 401, "Attacker password was accepted! Password overwrite occurred!");
  console.log("✓ Test 3 Passed: Original password preserved; attacker password rejected (HTTP 401).");

  // TEST 4: Admin API Access Control (SEC-01)
  console.log("\n[Test 4] SEC-01: Admin API unauthenticated access must be rejected (HTTP 401)");
  const unauthAdmin = await invokeApp("GET", "/api/v1/admin/users");
  assert.strictEqual(unauthAdmin.status, 401, `Expected 401 Unauthorized, got ${unauthAdmin.status}`);
  console.log("✓ Test 4 Passed: Unauthenticated admin request returned HTTP 401.");

  // TEST 5: Non-admin user accessing Admin API (SEC-01)
  console.log("\n[Test 5] SEC-01: Non-admin user accessing Admin API must be forbidden (HTTP 403)");
  const nonAdminRes = await invokeApp("GET", "/api/v1/admin/users", {
    Authorization: `Bearer ${userToken}`,
  });
  assert.strictEqual(nonAdminRes.status, 403, `Expected 403 Forbidden for non-admin user, got ${nonAdminRes.status}`);
  console.log("✓ Test 5 Passed: Authenticated non-admin request returned HTTP 403 Forbidden.");

  // TEST 6: Demo header bypass attempt (SEC-01)
  console.log("\n[Test 6] SEC-01: Non-admin user with 'x-demo-mode: true' must be rejected (HTTP 403)");
  const demoBypassRes = await invokeApp("GET", "/api/v1/admin/users", {
    Authorization: `Bearer ${userToken}`,
    "x-demo-mode": "true",
  });
  assert.strictEqual(demoBypassRes.status, 403, `Bypass succeeded! Expected 403 Forbidden, got ${demoBypassRes.status}`);

  const demoBypassMonitoring = await invokeApp("GET", "/api/v1/admin/monitoring", {
    Authorization: `Bearer ${userToken}`,
    "x-demo-mode": "true",
  });
  assert.strictEqual(demoBypassMonitoring.status, 403, `Bypass on monitoring succeeded! Expected 403, got ${demoBypassMonitoring.status}`);
  console.log("✓ Test 6 Passed: Fake demo header 'x-demo-mode: true' successfully BLOCKED (HTTP 403).");

  // TEST 7: Legitimate Admin login & access
  console.log("\n[Test 7] SEC-01: Legitimate Admin user access");
  // Admin user ID 1 token
  const adminToken = "mock-token-1";
  const adminAccessRes = await invokeApp("GET", "/api/v1/admin/users", {
    Authorization: `Bearer ${adminToken}`,
  });
  assert.strictEqual(adminAccessRes.status, 200, `Expected 200 OK for admin, got ${adminAccessRes.status}`);
  assert(Array.isArray(adminAccessRes.body.users), "admin/users should return array of users");
  console.log(`✓ Test 7 Passed: Legitimate admin access permitted (HTTP 200, retrieved ${adminAccessRes.body.users.length} users).`);

  // TEST 8: Admin monitoring telemetry endpoint
  console.log("\n[Test 8] Admin monitoring telemetry endpoint");
  const monRes = await invokeApp("GET", "/api/v1/admin/monitoring", {
    Authorization: `Bearer ${adminToken}`,
  });
  assert.strictEqual(monRes.status, 200, `Expected 200 OK for monitoring, got ${monRes.status}`);
  assert(monRes.body.storage, "Missing storage health");
  assert(monRes.body.llm_health, "Missing LLM provider routing health");
  console.log("✓ Test 8 Passed: Admin monitoring returns real health and multi-provider telemetry.");

  console.log("\n=======================================================");
  console.log("ALL PHASE 2 HTTP & AUTHORIZATION SECURITY TESTS PASSED!");
  console.log("=======================================================\n");
  process.exit(0);
}

run().catch((err) => {
  console.error("\n❌ HTTP Security Integration Test Failed:", err);
  process.exit(1);
});
