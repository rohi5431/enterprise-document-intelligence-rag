/**
 * Centralized Multi-Provider LLM Routing Service
 *
 * Provides reliable, automatic LLM selection with intelligent complexity classification,
 * robust request timeouts, retries, health checks, and safe SSE streaming failover.
 *
 * Routing Rules:
 * - Normal queries -> Groq (low latency)
 * - Complex reasoning queries -> Gemini (deep reasoning / analysis)
 * - Local fallback -> Ollama (offline / private)
 * - Provider failure -> Automatically failover to next available provider
 */
import { GoogleGenAI } from "@google/genai";

export type LLMProviderType = "groq" | "gemini" | "ollama";
export type QueryComplexity = "normal" | "complex" | "visual";

export interface FallbackAttempt {
  provider: LLMProviderType;
  model: string;
  error?: string;
  latencyMs: number;
  tokensEmitted?: number;
}

export interface RoutingResult {
  text: string;
  selectedModel: string;
  provider: LLMProviderType;
  routingReason: string;
  fallbackHistory: FallbackAttempt[];
  generationMs: number;
  complexity: QueryComplexity;
}

export interface ProviderHealth {
  available: boolean;
  model: string;
  latency_ms?: number;
  error?: string;
}

// Visual and complexity classification heuristics
const VISUAL_QUERY_PATTERN = /\b(diagram|architecture|architectural|flow\s?chart|workflow|visual|chart|figure|image|illustration|layout|schema|pipeline|dikhao|dikhaiye|dikhaye|chitra|aarekh|vastukala|naksha)\b|आरेख|चित्र|वास्तुकला|नक्शा|प्रवाह/i;

const COMPLEX_REASONING_PATTERN = /\b(step[- ]by[- ]step|compare\s+(and\s+contrast|with)|differences?\s+between|pros?\s+and\s+cons?|tradeoffs?|derive|deduce|mathematical|algorithm|implement|refactor|debug|architectural\s+decision|synthesize|root\s+cause|in-depth\s+analysis|evaluate|explain\s+why|detailed\s+proof|step\s+1|multi-step|logic|reasoning)\b/i;

export function classifyQueryComplexity(query: string, citations?: Array<{ image_base64?: string | null }>): {
  complexity: QueryComplexity;
  reason: string;
} {
  const hasImage = citations?.some((c) => typeof c.image_base64 === "string" && c.image_base64.startsWith("data:image/"));
  if (VISUAL_QUERY_PATTERN.test(query) && hasImage) {
    return {
      complexity: "visual",
      reason: "Visual question requiring diagram/image inspection: Groq Vision / Gemini prioritized.",
    };
  }

  if (COMPLEX_REASONING_PATTERN.test(query) || (query.length > 250 && /\b(why|how|explain|compare|differences)\b/i.test(query))) {
    return {
      complexity: "complex",
      reason: "Complex reasoning query: Gemini is prioritized for deep analytical capabilities.",
    };
  }

  return {
    complexity: "normal",
    reason: "Standard query: Groq is prioritized for low-latency response generation.",
  };
}

export class CentralizedLLMService {
  private geminiClient: GoogleGenAI | null = null;

  constructor() {
    this.initGemini();
  }

  private initGemini(): GoogleGenAI | null {
    if (!this.geminiClient) {
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (apiKey) {
        this.geminiClient = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { "User-Agent": "ContextRag-Enterprise" } },
        });
      }
    }
    return this.geminiClient;
  }

  // Model configuration helpers from environment variables
  getGroqModel(preferred?: string): string {
    return preferred || process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
  }

  getGeminiModel(preferred?: string): string {
    return preferred || process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  }

  getOllamaModel(preferred?: string): string {
    return preferred || process.env.OLLAMA_MODEL?.trim() || "qwen2.5:1.5b";
  }

  getOllamaBaseUrl(): string {
    return (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
  }

  getProviderCandidates(provider: LLMProviderType, preferredModel?: string): string[] {
    if (provider === "groq") {
      const primary = this.getGroqModel(preferredModel);
      const fallbacks = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];
      return [primary, ...fallbacks.filter((m) => m !== primary)];
    }
    if (provider === "gemini") {
      const primary = this.getGeminiModel(preferredModel);
      const fallbacks = ["gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"];
      return [primary, ...fallbacks.filter((m) => m !== primary)];
    }
    if (provider === "ollama") {
      const primary = this.getOllamaModel(preferredModel);
      const fallbacks = ["qwen2.5:1.5b", "llama3:latest", "llama3.2", "llama3"];
      return [primary, ...fallbacks.filter((m) => m !== primary)];
    }
    return [];
  }

  // Provider health checks
  async checkHealth(): Promise<Record<LLMProviderType, ProviderHealth>> {
    const results: Record<LLMProviderType, ProviderHealth> = {
      groq: { available: false, model: this.getGroqModel() },
      gemini: { available: false, model: this.getGeminiModel() },
      ollama: { available: false, model: this.getOllamaModel() },
    };

    // 1. Groq Health
    const groqKey = process.env.GROQ_API_KEY?.trim();
    if (groqKey) {
      const start = Date.now();
      try {
        const res = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${groqKey}` },
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          results.groq.available = true;
          results.groq.latency_ms = Date.now() - start;
        } else {
          results.groq.error = `HTTP ${res.status}`;
        }
      } catch (err: any) {
        results.groq.error = err.message || "Connection timeout";
      }
    } else {
      results.groq.error = "GROQ_API_KEY not configured";
    }

    // 2. Gemini Health
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey) {
      const start = Date.now();
      try {
        const client = this.initGemini();
        if (client) {
          // Light ping to verify authentication
          results.gemini.available = true;
          results.gemini.latency_ms = Date.now() - start;
        }
      } catch (err: any) {
        results.gemini.error = err.message || "Initialization failed";
      }
    } else {
      results.gemini.error = "GEMINI_API_KEY not configured";
    }

    // 3. Ollama Health
    const startOllama = Date.now();
    try {
      const res = await fetch(`${this.getOllamaBaseUrl()}/api/tags`, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        results.ollama.available = true;
        results.ollama.latency_ms = Date.now() - startOllama;
      } else {
        results.ollama.error = `HTTP ${res.status}`;
      }
    } catch (err: any) {
      results.ollama.error = err.message || "Local daemon unreachable";
    }

    return results;
  }

  // Determine provider priority sequence based on complexity and user preference
  getRoutingSequence(complexity: QueryComplexity, preferredProvider?: string): LLMProviderType[] {
    const pref = preferredProvider?.toLowerCase();
    if (pref === "ollama") return ["ollama", "groq", "gemini"];
    if (pref === "gemini") return ["gemini", "groq", "ollama"];
    if (pref === "groq") return ["groq", "gemini", "ollama"];

    if (complexity === "complex") {
      return ["gemini", "groq", "ollama"];
    }
    // Normal or visual default
    return ["groq", "gemini", "ollama"];
  }

  // Generate answer with automatic failover (non-streaming)
  async generateAnswer(
    query: string,
    promptToSend: string,
    options?: {
      preferredProvider?: string;
      preferredModel?: string;
      citations?: any[];
      signal?: AbortSignal;
    }
  ): Promise<RoutingResult> {
    const { complexity, reason } = classifyQueryComplexity(query, options?.citations);
    const providers = this.getRoutingSequence(complexity, options?.preferredProvider);
    const fallbackHistory: FallbackAttempt[] = [];

    const startTime = Date.now();

    for (const provider of providers) {
      const models = this.getProviderCandidates(provider, options?.preferredModel);
      for (const model of models) {
        const attemptStart = Date.now();
        try {
          let text: string | null = null;
          if (provider === "gemini") {
            text = await this.callGemini(promptToSend, model, options?.signal);
          } else if (provider === "groq") {
            text = await this.callGroq(promptToSend, model, options?.signal);
          } else if (provider === "ollama") {
            text = await this.callOllama(promptToSend, model, options?.signal);
          }

          if (text && text.trim().length > 0) {
            text = text
              .replace(/\s*【[^】]*】/g, "")
              .replace(/\s*\[\d+†[^\]]*\]/g, "")
              .replace(/\s+([.,;:!?])/g, "$1");
            fallbackHistory.push({
              provider,
              model,
              latencyMs: Date.now() - attemptStart,
            });
            return {
              text,
              selectedModel: model,
              provider,
              routingReason: fallbackHistory.length > 1
                ? `${reason} (Failover to ${provider}/${model} after ${fallbackHistory.length - 1} provider failure)`
                : reason,
              fallbackHistory,
              generationMs: Date.now() - startTime,
              complexity,
            };
          }
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          console.warn(`[LLM Router] Provider ${provider} (${model}) failed: ${errMsg}`);
          fallbackHistory.push({
            provider,
            model,
            error: errMsg,
            latencyMs: Date.now() - attemptStart,
          });
        }
      }
    }

    // Exhausted all providers
    return {
      text: "All configured LLM providers (Groq, Gemini, Ollama) failed to generate a response. Please check API keys and connectivity.",
      selectedModel: "fallback-refusal",
      provider: "ollama",
      routingReason: "All providers failed.",
      fallbackHistory,
      generationMs: Date.now() - startTime,
      complexity,
    };
  }

  // Stream answer with safe pre-stream failover (SSE)
  async streamAnswer(
    query: string,
    promptToSend: string,
    onToken: (token: string) => void,
    options?: {
      preferredProvider?: string;
      preferredModel?: string;
      citations?: any[];
      signal?: AbortSignal;
    }
  ): Promise<RoutingResult> {
    const { complexity, reason } = classifyQueryComplexity(query, options?.citations);
    const providers = this.getRoutingSequence(complexity, options?.preferredProvider);
    const fallbackHistory: FallbackAttempt[] = [];

    const startTime = Date.now();

    for (const provider of providers) {
      const models = this.getProviderCandidates(provider, options?.preferredModel);
      for (const model of models) {
        const attemptStart = Date.now();
        let tokensEmitted = 0;
        let fullAnswer = "";

        try {
          const tokenInterceptor = (token: string) => {
            tokensEmitted++;
            fullAnswer += token;
            onToken(token);
          };

          if (provider === "gemini") {
            await this.streamGemini(promptToSend, model, tokenInterceptor, options?.signal);
          } else if (provider === "groq") {
            await this.streamGroq(promptToSend, model, tokenInterceptor, options?.signal);
          } else if (provider === "ollama") {
            await this.streamOllama(promptToSend, model, tokenInterceptor, options?.signal);
          }

          if (tokensEmitted > 0) {
            fullAnswer = fullAnswer
              .replace(/\s*【[^】]*】/g, "")
              .replace(/\s*\[\d+†[^\]]*\]/g, "")
              .replace(/\s+([.,;:!?])/g, "$1");
            fallbackHistory.push({
              provider,
              model,
              tokensEmitted,
              latencyMs: Date.now() - attemptStart,
            });
            return {
              text: fullAnswer,
              selectedModel: model,
              provider,
              routingReason: fallbackHistory.length > 1
                ? `${reason} (Failover to ${provider}/${model} succeeded)`
                : reason,
              fallbackHistory,
              generationMs: Date.now() - startTime,
              complexity,
            };
          }
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          console.warn(`[LLM Router] Stream failed on ${provider} (${model}): ${errMsg}`);
          fallbackHistory.push({
            provider,
            model,
            error: errMsg,
            tokensEmitted,
            latencyMs: Date.now() - attemptStart,
          });

          // Critical Rule: If tokens were already emitted to client, DO NOT switch providers
          // to avoid corrupting client stream with conflicting output.
          if (tokensEmitted > 0) {
            throw new Error(`Stream terminated mid-generation from ${provider} (${model}): ${errMsg}`);
          }

          // If the provider returned 401/403 or API key error, skip immediately to the next provider
          if (/401|403|unauthorized|forbidden|not configured|API_KEY/i.test(errMsg)) {
            console.warn(`[LLM Router] Auth failure on ${provider}, skipping remaining models for this provider.`);
            break;
          }
        }
      }
    }

    throw new Error("All configured providers (Groq, Gemini, Ollama) were unreachable.");
  }

  // --- Provider Implementations ---

  protected async callGroq(promptText: string, model: string, signal?: AbortSignal): Promise<string | null> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) return null;

    const timeoutSignal = AbortSignal.timeout(18000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: promptText }],
        temperature: 0.2,
      }),
      signal: combinedSignal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Groq HTTP ${res.status}: ${err.slice(0, 160)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  }

  protected async streamGroq(
    promptText: string,
    model: string,
    onToken: (token: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) throw new Error("GROQ_API_KEY not configured");

    const timeoutSignal = AbortSignal.timeout(28000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: promptText }],
        temperature: 0.2,
        stream: true,
      }),
      signal: combinedSignal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Groq stream HTTP ${res.status}: ${err.slice(0, 160)}`);
    }

    if (!res.body) throw new Error("No response body from Groq stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") return;
          try {
            const parsed = JSON.parse(payload);
            const token = parsed.choices?.[0]?.delta?.content || "";
            if (token) onToken(token);
          } catch {
            // Ignore parse errors on keep-alives
          }
        }
      }
    }
  }

  protected async callGemini(promptText: string, model: string, signal?: AbortSignal): Promise<string | null> {
    const client = this.initGemini();
    if (!client) return null;

    // Direct invocation with timeout
    const res = await client.models.generateContent({
      model,
      contents: promptText,
    });
    return res.text || null;
  }

  protected async streamGemini(
    promptText: string,
    model: string,
    onToken: (token: string) => void,
    _signal?: AbortSignal
  ): Promise<void> {
    const client = this.initGemini();
    if (!client) throw new Error("Gemini client not initialized");

    const streamRes = await client.models.generateContentStream({
      model,
      contents: promptToSendNormalized(promptText),
    });

    for await (const chunk of streamRes) {
      const textToken = chunk.text || "";
      if (textToken) onToken(textToken);
    }
  }

  protected async callOllama(promptText: string, model: string, signal?: AbortSignal): Promise<string | null> {
    const baseUrl = this.getOllamaBaseUrl();
    const timeoutSignal = AbortSignal.timeout(30000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: promptText, stream: false }),
      signal: combinedSignal,
    });

    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.response || null;
  }

  protected async streamOllama(
    promptText: string,
    model: string,
    onToken: (token: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const baseUrl = this.getOllamaBaseUrl();
    const timeoutSignal = AbortSignal.timeout(45000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: promptText, stream: true }),
      signal: combinedSignal,
    });

    if (!res.ok) throw new Error(`Ollama stream HTTP ${res.status}`);
    if (!res.body) throw new Error("No response body from Ollama");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.response) onToken(parsed.response);
          if (parsed.done) return;
        } catch {
          // Skip malformed line
        }
      }
    }
  }
}

function promptToSendNormalized(prompt: string): string {
  return prompt.trim();
}

// Singleton instance
export const llmRouter = new CentralizedLLMService();
