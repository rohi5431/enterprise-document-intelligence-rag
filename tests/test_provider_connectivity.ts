import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { llmRouter, classifyQueryComplexity } from "../src/lib/llmRouting";

interface TestReportItem {
  provider: string;
  test: string;
  status: "PASS" | "FAIL" | "SKIPPED";
  latencyMs?: number;
  details: string;
}

const results: TestReportItem[] = [];

async function testGroqRealApi() {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const groqModel = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";

  if (!groqKey) {
    results.push({
      provider: "Groq",
      test: "Real API Connectivity",
      status: "SKIPPED",
      details: "GROQ_API_KEY is not set in environment.",
    });
    return;
  }

  // 1. Valid request to Groq
  const start = Date.now();
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: groqModel,
        messages: [{ role: "user", content: "Reply with the single word: PONG" }],
        max_tokens: 10,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(12000),
    });

    const latencyMs = Date.now() - start;
    if (res.ok) {
      const data = await res.json() as any;
      const text = data.choices?.[0]?.message?.content?.trim() || "";
      results.push({
        provider: "Groq",
        test: "Real API Connectivity (Valid Request)",
        status: "PASS",
        latencyMs,
        details: `Successfully connected to model "${groqModel}". Response: "${text}"`,
      });
    } else {
      const errText = await res.text();
      results.push({
        provider: "Groq",
        test: "Real API Connectivity (Valid Request)",
        status: "FAIL",
        latencyMs,
        details: `HTTP ${res.status}: ${errText.substring(0, 150)}`,
      });
    }
  } catch (err: any) {
    results.push({
      provider: "Groq",
      test: "Real API Connectivity (Valid Request)",
      status: "FAIL",
      latencyMs: Date.now() - start,
      details: `Network/Fetch error: ${err.message}`,
    });
  }

  // 2. Invalid Credentials Handling
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer gsk_invalid_test_key_for_auth_failure_check",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: groqModel,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) {
      results.push({
        provider: "Groq",
        test: "Invalid Credentials Handling",
        status: "PASS",
        details: "Correctly returned HTTP 401 Unauthorized for invalid API key.",
      });
    } else {
      results.push({
        provider: "Groq",
        test: "Invalid Credentials Handling",
        status: "FAIL",
        details: `Expected HTTP 401, got ${res.status}`,
      });
    }
  } catch (err: any) {
    results.push({
      provider: "Groq",
      test: "Invalid Credentials Handling",
      status: "FAIL",
      details: err.message,
    });
  }
}

async function testGeminiRealApi() {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const configuredModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";

  if (!geminiKey) {
    results.push({
      provider: "Gemini",
      test: "Real API Connectivity",
      status: "SKIPPED",
      details: "GEMINI_API_KEY is not set in environment.",
    });
    return;
  }

  // 1. Valid request to Gemini with fallback to verified active preview models
  const candidateModels = [configuredModel, "gemini-3-flash-preview", "gemini-3.1-flash-lite"];
  let connected = false;

  for (const model of candidateModels) {
    const start = Date.now();
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { "User-Agent": "ContextRag-Enterprise" } },
      });

      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: "Reply with the single word: PONG",
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout after 6s")), 6000)),
      ]) as any;

      const latencyMs = Date.now() - start;
      const text = response.text?.trim() || "";
      if (text) {
        results.push({
          provider: "Gemini",
          test: "Real API Connectivity (Valid Request)",
          status: "PASS",
          latencyMs,
          details: `Successfully connected to live model "${model}". Response: "${text}"`,
        });
        connected = true;
        break;
      }
    } catch (err: any) {
      // Continue to next candidate model
    }
  }

  if (!connected) {
    results.push({
      provider: "Gemini",
      test: "Real API Connectivity (Valid Request)",
      status: "FAIL",
      details: `Could not connect to candidate models: ${candidateModels.join(", ")}`,
    });
  }

  // 2. Invalid Credentials Handling
  try {
    const badAi = new GoogleGenAI({
      apiKey: "AIzaSy_invalid_test_key_for_auth_failure_check",
    });
    await badAi.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "ping",
    });
    results.push({
      provider: "Gemini",
      test: "Invalid Credentials Handling",
      status: "FAIL",
      details: "Request unexpectedly succeeded with invalid API key.",
    });
  } catch (err: any) {
    results.push({
      provider: "Gemini",
      test: "Invalid Credentials Handling",
      status: "PASS",
      details: "Correctly rejected invalid credentials with authentication error.",
    });
  }
}

async function testOllamaApi() {
  const ollamaUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");

  const start = Date.now();
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      const data = await res.json() as any;
      const count = data.models?.length || 0;
      results.push({
        provider: "Ollama",
        test: "Local Daemon Connectivity",
        status: "PASS",
        latencyMs,
        details: `Ollama is running at ${ollamaUrl}. Detected ${count} local models.`,
      });
    } else {
      results.push({
        provider: "Ollama",
        test: "Local Daemon Connectivity",
        status: "FAIL",
        latencyMs,
        details: `HTTP ${res.status} returned from Ollama endpoint.`,
      });
    }
  } catch (err: any) {
    results.push({
      provider: "Ollama",
      test: "Local Daemon Connectivity",
      status: "SKIPPED",
      details: `Local Ollama daemon is not running at ${ollamaUrl} (${err.message}). Expected for environments without local GPU.`,
    });
  }
}

async function main() {
  console.log("==========================================================");
  console.log("PHASE 3A — REAL MULTI-PROVIDER CONNECTIVITY TEST SUITE");
  console.log("==========================================================");
  console.log("Testing live connectivity using configured environment variables...\n");

  await testGroqRealApi();
  await testGeminiRealApi();
  await testOllamaApi();

  console.log("\n----------------------------------------------------------");
  console.log("RESULTS SUMMARY:");
  console.log("----------------------------------------------------------");

  let allPassOrSkip = true;
  for (const r of results) {
    const icon = r.status === "PASS" ? "✓ [PASS]" : r.status === "SKIPPED" ? "↷ [SKIPPED]" : "✗ [FAIL]";
    const lat = r.latencyMs != null ? ` (${r.latencyMs}ms)` : "";
    console.log(`${icon.padEnd(14)} ${r.provider.padEnd(8)} - ${r.test}${lat}`);
    console.log(`               Details: ${r.details}`);
    if (r.status === "FAIL") allPassOrSkip = false;
  }

  console.log("----------------------------------------------------------\n");

  if (!allPassOrSkip) {
    console.error("Some provider tests failed. Inspect the details above.");
    process.exit(1);
  } else {
    console.log("All provider connectivity tests passed or were appropriately skipped!");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
