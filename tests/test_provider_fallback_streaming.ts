import assert from "assert";
import { CentralizedLLMService, classifyQueryComplexity, LLMProviderType } from "../src/lib/llmRouting";

async function runFallbackAndStreamingTests() {
  console.log("=== RUNNING PHASE 3B: PROVIDER FALLBACK & STREAMING RELIABILITY ===");

  const router = new CentralizedLLMService();

  // 1. Classification deterministic test
  console.log("\n[Test 1] Deterministic Query Routing Sequence");
  const normalSeq = router.getRoutingSequence("normal");
  assert.deepStrictEqual(normalSeq, ["groq", "gemini", "ollama"], "Normal sequence should be Groq -> Gemini -> Ollama");

  const complexSeq = router.getRoutingSequence("complex");
  assert.deepStrictEqual(complexSeq, ["gemini", "groq", "ollama"], "Complex sequence should be Gemini -> Groq -> Ollama");

  const localPrefSeq = router.getRoutingSequence("normal", "ollama");
  assert.deepStrictEqual(localPrefSeq, ["ollama", "groq", "gemini"], "User preference Ollama should prioritize Ollama first");
  console.log("✓ Test 1 Passed: Routing sequence order strictly preserved.");

  // 2. Pre-stream Failover Simulation
  console.log("\n[Test 2] Pre-stream Fallback (Failure before first token)");
  // Create a router instance where primary provider throws before emitting tokens
  class MockFailingRouter extends CentralizedLLMService {
    public primaryFailed = false;
    public secondaryCalled = false;

    // Simulate primary failure
    async callGroq(prompt: string, model: string): Promise<string | null> {
      this.primaryFailed = true;
      throw new Error("Simulated network timeout 504 on primary Groq");
    }

    async callGemini(prompt: string, model: string): Promise<string | null> {
      this.secondaryCalled = true;
      return "Success response from secondary provider Gemini";
    }
  }

  const mockRouter = new MockFailingRouter();
  const nonStreamResult = await mockRouter.generateAnswer("What is RAG?", "What is RAG?", {
    preferredProvider: "groq",
  });

  assert(mockRouter.primaryFailed, "Primary provider was not attempted");
  assert(mockRouter.secondaryCalled, "Secondary provider was not invoked on primary failure");
  assert.strictEqual(nonStreamResult.provider, "gemini", "Result should have been provided by Gemini");
  assert(nonStreamResult.fallbackHistory.length >= 2, "Fallback history must record the initial failure");
  assert.strictEqual(nonStreamResult.fallbackHistory[0].provider, "groq");
  assert(nonStreamResult.fallbackHistory[0].error?.includes("Simulated network timeout"), "Primary error must be recorded");
  console.log("✓ Test 2 Passed: Pre-generation failover automatically recovered to secondary provider.");

  // 3. Streaming Mid-Stream Failure Prevention (Zero Cross-Provider Contamination)
  console.log("\n[Test 3] Streaming Mid-stream Failure Contamination Guard");
  class MockMidStreamFailingRouter extends CentralizedLLMService {
    public emittedTokens: string[] = [];

    // Simulate stream emitting 2 tokens then connection resetting mid-stream
    async streamGroq(prompt: string, model: string, onToken: (token: string) => void): Promise<void> {
      onToken("Token1 ");
      this.emittedTokens.push("Token1 ");
      onToken("Token2 ");
      this.emittedTokens.push("Token2 ");
      throw new Error("Connection reset mid-stream from Groq");
    }

    async streamGemini(prompt: string, model: string, onToken: (token: string) => void): Promise<void> {
      // Must NOT be reached because tokens were already emitted!
      onToken("WRONG SECOND PROVIDER ANSWER");
    }
  }

  const midStreamRouter = new MockMidStreamFailingRouter();
  const clientReceivedTokens: string[] = [];
  let streamErrorCaught = false;

  try {
    await midStreamRouter.streamAnswer(
      "Query",
      "Prompt",
      (token) => clientReceivedTokens.push(token),
      { preferredProvider: "groq" }
    );
  } catch (err: any) {
    streamErrorCaught = true;
    assert(err.message.includes("mid-generation"), `Error message should report mid-generation termination: ${err.message}`);
  }

  assert(streamErrorCaught, "Mid-stream error was not thrown");
  assert.deepStrictEqual(clientReceivedTokens, ["Token1 ", "Token2 "], "Client tokens were contaminated with second provider!");
  assert(!clientReceivedTokens.some((t) => t.includes("WRONG SECOND PROVIDER")), "Stream contamination detected!");
  console.log("✓ Test 3 Passed: Mid-stream failover aborted cleanly with zero cross-provider answer contamination.");

  // 4. Pre-stream failover during streaming (0 tokens emitted from primary)
  console.log("\n[Test 4] Safe pre-stream streaming failover");
  class MockPreStreamFailingRouter extends CentralizedLLMService {
    async streamGroq(prompt: string, model: string, onToken: (token: string) => void): Promise<void> {
      // Fails immediately before emitting any token
      throw new Error("Rate limit 429 on Groq");
    }

    async streamGemini(prompt: string, model: string, onToken: (token: string) => void): Promise<void> {
      onToken("Clean Gemini streamed response token");
    }
  }

  const preStreamRouter = new MockPreStreamFailingRouter();
  const preStreamClientTokens: string[] = [];

  const streamResult = await preStreamRouter.streamAnswer(
    "Query",
    "Prompt",
    (token) => preStreamClientTokens.push(token),
    { preferredProvider: "groq" }
  );

  assert.strictEqual(streamResult.provider, "gemini");
  assert.strictEqual(preStreamClientTokens.length, 1);
  assert.strictEqual(preStreamClientTokens[0], "Clean Gemini streamed response token");
  console.log("✓ Test 4 Passed: Safe pre-stream streaming failover correctly transferred to secondary provider.");

  console.log("\n=======================================================");
  console.log("ALL PHASE 3B FALLBACK & STREAMING RELIABILITY TESTS PASSED!");
  console.log("=======================================================\n");
}

runFallbackAndStreamingTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
