import assert from "assert";
import http from "http";
import { hashPassword, verifyPassword, generateAccessToken, verifyAccessToken } from "../src/lib/authUtils";
import { validateUploadedFile, parseCsvToText, parseMarkdownToText } from "../src/lib/documentParsers";
import { classifyQueryComplexity } from "../src/lib/llmRouting";

async function runTests() {
  console.log("=== RUNNING PHASE 2 SECURITY & VERIFICATION GATE ===");

  // 1. Password Hashing & Verification (SEC-03)
  console.log("\n[Test 1] SEC-03: Password Hashing & Verification");
  const plain = "SuperSecretPassword123!";
  const hash = hashPassword(plain);
  assert(hash.startsWith("scrypt:"), "Hash must use scrypt format");
  assert(verifyPassword(plain, hash), "Password verification failed for correct password");
  assert(!verifyPassword("WrongPassword", hash), "Password verification succeeded for incorrect password");
  
  // Legacy plaintext backward compatibility
  const legacyPlain = "old_plain_password";
  assert(verifyPassword(legacyPlain, legacyPlain), "Legacy plaintext verification failed");
  assert(!verifyPassword("wrong", legacyPlain), "Legacy plaintext accepted wrong password");
  console.log("✓ SEC-03 Passed: Password hashing, verification, and legacy upgrade verified.");

  // 2. Cryptographic Access Tokens (SEC-03)
  console.log("\n[Test 2] SEC-03: Signed Cryptographic Access Tokens");
  const testUser = { id: 42, email: "alice@enterprise.com", role: "user" as const };
  const token = generateAccessToken(testUser);
  assert(token.startsWith("cr_"), "Token must use secure signed prefix");
  
  const verified = verifyAccessToken(token);
  assert(verified !== null, "Token verification failed for valid token");
  assert.strictEqual(verified.userId, 42);
  assert.strictEqual(verified.email, "alice@enterprise.com");
  assert.strictEqual(verified.role, "user");

  // Tampered signature test
  const tamperedToken = token.slice(0, -6) + "abcdef";
  assert.strictEqual(verifyAccessToken(tamperedToken), null, "Tampered token was accepted!");

  // Legacy mock token test for backward compatibility
  const legacyMock = "mock-token-42";
  const legacyVerified = verifyAccessToken(legacyMock);
  assert(legacyVerified !== null, "Legacy mock token was not accepted");
  assert.strictEqual(legacyVerified.userId, 42);
  console.log("✓ SEC-03 Passed: HMAC-SHA256 signed tokens and tamper rejection verified.");

  // 3. Document Validation & Parsing (Task 11)
  console.log("\n[Test 3] Task 11: Document Ingestion, MIME Validation & Parsing");
  const validBuffer = Buffer.from("col1,col2\nval1,val2", "utf-8");
  const validRes = validateUploadedFile("data.csv", validBuffer, "text/csv");
  assert(validRes.valid, "Valid CSV file was rejected");
  assert(typeof validRes.contentHash === "string" && validRes.contentHash.length === 64, "Content hash not computed");

  // Oversized file test
  const hugeBuffer = Buffer.alloc(16 * 1024 * 1024); // 16MB > 15MB limit
  const hugeRes = validateUploadedFile("big.pdf", hugeBuffer, "application/pdf");
  assert(!hugeRes.valid, "Oversized file was accepted");

  // Dangerous executable extension test
  const exeRes = validateUploadedFile("malware.exe", Buffer.from("bad"), "application/octet-stream");
  assert(!exeRes.valid, "Executable file was accepted");

  // CSV parsing test
  const parsedCsv = parseCsvToText("Name,Department,Salary\nBob,Engineering,120000\nAlice,AI,140000");
  assert(parsedCsv.includes("| Name | Department | Salary |"), "CSV table header missing");
  assert(parsedCsv.includes("Bob"), "CSV row data missing");

  // Markdown parsing test
  const parsedMd = parseMarkdownToText("# Title\n\nContent paragraph.");
  assert(parsedMd.includes("# Title"), "Markdown header missing");
  console.log("✓ Task 11 Passed: File validation, MIME checks, and CSV/MD parsing verified.");

  // 4. LLM Query Complexity Classification (Task 6)
  console.log("\n[Test 4] Task 6: LLM Complexity Classification");
  const normalQuery = "What is the return policy?";
  const normClass = classifyQueryComplexity(normalQuery);
  assert.strictEqual(normClass.complexity, "normal", "Normal query misclassified");

  const complexQuery = "Explain step-by-step differences between vector similarity and BM25 and compare tradeoffs.";
  const compClass = classifyQueryComplexity(complexQuery);
  assert.strictEqual(compClass.complexity, "complex", "Complex reasoning query misclassified");

  const visualQuery = "Explain this architecture diagram in detail";
  const visClass = classifyQueryComplexity(visualQuery, [{ image_base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" }]);
  assert.strictEqual(visClass.complexity, "visual", "Visual query misclassified");
  console.log("✓ Task 6 Passed: Intelligent query routing classification verified.");

  console.log("\n==================================================");
  console.log("ALL PHASE 2 UNIT & LOGIC SECURITY GATES PASSED!");
  console.log("==================================================\n");
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
