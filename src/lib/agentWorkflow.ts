import { GoogleGenAI } from "@google/genai";
import { scanAndSanitizePrompt } from "./guardrails";
import { routeModel } from "./router";
import { compilePrompt } from "./prompts";
import { SessionMemory } from "./memory";
import { cosineSimilarity, computeBm25Score } from "./retrievalUtils";

export interface AgentState {
  userId: number;
  tenantId: string;
  workspaceId: string;
  originalQuery: string;
  query: string; // current working query
  rewrittenQuery?: string;
  multiQueries: string[];
  sessionId?: number | null;
  template?: string;
  filters?: {
    department?: string;
    tags?: string[];
    document_type?: string;
    security_level?: string;
  };

  // Pipeline Data
  retrievedChunks: any[];
  rerankedChunks: any[];
  citations: any[];
  
  // Prompt / Memory
  systemInstruction?: string;
  promptText?: string;
  contextString?: string;
  memory?: SessionMemory;
  
  // Model Decision
  selectedModel: string;
  modelRoutingReason: string;
  costEstimate: number;
  
  // Output
  answer: string;
  
  // Guardrails
  unsafeDetected: boolean;
  blockReason?: string;
  piiMasked: boolean;

  // Timings
  diagnostics: {
    planning_ms: number;
    rewriter_ms: number;
    retrieval_ms: number;
    rerank_ms: number;
    generation_ms: number;
    total_ms: number;
  };

  // Pipeline Overrides
  hybridSearchEnabled?: boolean;
  rerankingEnabled?: boolean;
  queryRewritingEnabled?: boolean;
  queryExpansionEnabled?: boolean;
  parentChildEnabled?: boolean;
  guardrailsEnabled?: boolean;
}

export class AgentWorkflow {
  private ai: GoogleGenAI | null;
  private db: any;

  constructor(ai: GoogleGenAI | null, db: any) {
    this.ai = ai;
    this.db = db;
  }

  /**
   * Executes the entire RAG pipeline as a state-passing flow
   */
  async execute(initialState: Partial<AgentState>): Promise<AgentState> {
    const start = Date.now();
    let state: AgentState = {
      userId: initialState.userId || 1,
      tenantId: initialState.tenantId || "default-tenant",
      workspaceId: initialState.workspaceId || "default-workspace",
      originalQuery: initialState.originalQuery || "",
      query: initialState.originalQuery || "",
      multiQueries: [],
      sessionId: initialState.sessionId || null,
      template: initialState.template || "standard",
      filters: initialState.filters || {},
      retrievedChunks: [],
      rerankedChunks: [],
      citations: [],
      selectedModel: "gemini-3.5-flash",
      modelRoutingReason: "Default model baseline",
      costEstimate: 0,
      answer: "",
      unsafeDetected: false,
      piiMasked: false,
      diagnostics: {
        planning_ms: 0,
        rewriter_ms: 0,
        retrieval_ms: 0,
        rerank_ms: 0,
        generation_ms: 0,
        total_ms: 0,
      },
      ...initialState,
    };

    // 1. Guardrail Check (Initial safe scan)
    state = await this.guardrailNode(state);
    if (state.unsafeDetected) {
      state.answer = `AI Guardrail Block: ${state.blockReason}`;
      state.diagnostics.total_ms = Date.now() - start;
      return state;
    }

    // 2. Planning Node
    state = await this.plannerNode(state);

    // 3. Query Rewriter Node (Rewrites / generates multi-queries)
    state = await this.queryRewriterNode(state);

    // 4. Retriever Node (Hybrid Vector + Lexical with Parent-Child mapping)
    state = await this.retrieverNode(state);

    // 5. Re-ranker Node (CrossEncoder alignment)
    state = await this.rerankerNode(state);

    // 6. Context Builder Node (Memory and Templates compiling)
    state = await this.contextBuilderNode(state);

    // 7. Model Router Node (Dynamically selects model)
    state = await this.modelRouterNode(state);

    state.diagnostics.total_ms = Date.now() - start;
    return state;
  }

  // === NODES ===

  private async guardrailNode(state: AgentState): Promise<AgentState> {
    if (state.guardrailsEnabled === false) {
      return {
        ...state,
        query: state.originalQuery,
        unsafeDetected: false,
        piiMasked: false,
      };
    }
    const result = scanAndSanitizePrompt(state.originalQuery);
    return {
      ...state,
      query: result.sanitizedQuery,
      unsafeDetected: !result.safe,
      blockReason: result.reason,
      piiMasked: result.piiDetected,
    };
  }

  private async plannerNode(state: AgentState): Promise<AgentState> {
    const start = Date.now();
    // Retrieve conversation memory if session exists
    let memory: SessionMemory = {
      summary: "",
      important_facts: [],
      context_window_size: 6,
      recent_history: [],
      user_preferences: {},
    };

    if (state.sessionId) {
      const activeMem = this.db.sessions?.find((s: any) => s.id === state.sessionId)?.memory;
      if (activeMem) memory = activeMem;
    }

    state.diagnostics.planning_ms = Date.now() - start;
    return { ...state, memory };
  }

  private async queryRewriterNode(state: AgentState): Promise<AgentState> {
    const start = Date.now();
    let rewritten = state.query;
    const variants: string[] = [state.query];

    const prefs = this.db.user_prefs?.[state.userId] || { query_expansion_enabled: false };
    const rewriteEnabled = state.queryRewritingEnabled !== false;
    const expansionEnabled = state.queryExpansionEnabled ?? prefs.query_expansion_enabled;

    if (this.ai) {
      try {
        // Query rewriting
        if (rewriteEnabled) {
          const rewriteRes = await this.ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: `You are an expert search engineer. Rewrite this user question to optimize it for vector search and keyword indices. Output ONLY the rewritten search query, do not explain or add commentary. Question: ${state.query}`,
          });
          if (rewriteRes.text) {
            rewritten = rewriteRes.text.trim();
            variants.push(rewritten);
          }
        }

        // Multi Query generation (expand to 3 variants total)
        if (expansionEnabled) {
          const multiRes = await this.ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: `Generate exactly 2 diverse search query variants (one per line) for this prompt to optimize RAG retrieval recall. Do not include numbered bullets. Prompt: ${state.query}`,
          });
          const lines = multiRes.text?.split("\n").map((l) => l.trim().replace(/^[-*0-9.]\s*/, "")).filter((l) => l.length > 3) || [];
          variants.push(...lines);
        }
      } catch (err) {
        console.warn("Query rewriter failed, falling back to original query", err);
      }
    }

    state.diagnostics.rewriter_ms = Date.now() - start;
    return {
      ...state,
      rewrittenQuery: rewritten,
      multiQueries: Array.from(new Set(variants)).slice(0, 4),
    };
  }

  private async retrieverNode(state: AgentState): Promise<AgentState> {
    const start = Date.now();
    
    // Retrieve documents owned by user / tenant boundary
    const userDocIds = new Set(
      this.db.documents
        .filter((d: any) => d.user_id === state.userId && (!state.filters?.department || d.department === state.filters.department))
        .map((d: any) => d.id)
    );

    const userChunks = this.db.chunks.filter((c: any) => userDocIds.has(c.doc_id));
    const candidatesMap = new Map<string, { chunk: any; vectorScore: number; bm25Score: number }>();

    // Embed all multi-query variants
    const queryVectors = await Promise.all(
      state.multiQueries.map(async (q) => {
        if (!this.ai) return null;
        try {
          const res = await this.ai.models.embedContent({
            model: "gemini-embedding-2-preview",
            contents: q,
          });
          return (res as any).embedding?.values || null;
        } catch {
          return null;
        }
      })
    );

    // Compute hybrid relevance (Semantic + Lexical BM25) for each chunk
    userChunks.forEach((chunk: any) => {
      // Vector Similarity
      let maxVecScore = 0;
      queryVectors.forEach((qv) => {
        if (qv && chunk.embedding) {
          maxVecScore = Math.max(maxVecScore, cosineSimilarity(qv, chunk.embedding));
        }
      });

      // BM25 Text Scoring
      let maxBm25 = 0;
      state.multiQueries.forEach((q) => {
        maxBm25 = Math.max(maxBm25, computeBm25Score(chunk.text, q));
      });

      if (maxVecScore >= 0 || maxBm25 >= 0) {
        candidatesMap.set(chunk.id, { chunk, vectorScore: maxVecScore, bm25Score: maxBm25 });
      }
    });

    const candidatesList = Array.from(candidatesMap.values());

    // Compute Reciprocal Rank Fusion (RRF)
    candidatesList.sort((a, b) => b.vectorScore - a.vectorScore);
    const vecRanks = new Map<string, number>();
    candidatesList.forEach((item, idx) => vecRanks.set(item.chunk.id, idx + 1));

    candidatesList.sort((a, b) => b.bm25Score - a.bm25Score);
    const bmRanks = new Map<string, number>();
    candidatesList.forEach((item, idx) => bmRanks.set(item.chunk.id, idx + 1));

    const hybridEnabled = state.hybridSearchEnabled !== false;
    const fusedList = candidatesList.map((item) => {
      const vr = vecRanks.get(item.chunk.id) || 100;
      const br = bmRanks.get(item.chunk.id) || 100;
      const rrf = hybridEnabled ? (1 / (60 + vr) + 1 / (60 + br)) : (1 / (60 + vr));
      return { ...item, rrf };
    });

    fusedList.sort((a, b) => b.rrf - a.rrf);
    
    // Parent-Child mapping: Map candidate child chunk to parent chunk context if configured
    const parentChildEnabled = state.parentChildEnabled !== false;
    const mappedChunks = fusedList.slice(0, 50).map((item) => {
      let finalContent = item.chunk.text;
      
      // If parent_id exists, resolve parent document context
      if (parentChildEnabled && item.chunk.parent_id) {
        const parentDoc = this.db.chunks.find((c: any) => c.id === item.chunk.parent_id);
        if (parentDoc) {
          finalContent = parentDoc.text; // Return expanded parent context
        }
      }

      return {
        ...item,
        chunk: {
          ...item.chunk,
          text: finalContent,
        }
      };
    });

    state.diagnostics.retrieval_ms = Date.now() - start;
    return {
      ...state,
      retrievedChunks: mappedChunks,
    };
  }

  private async rerankerNode(state: AgentState): Promise<AgentState> {
    const start = Date.now();
    let topChunks = state.retrievedChunks.slice(0, 10); // Grab top 10 candidates for reranking

    const rerankEnabled = state.rerankingEnabled !== false;

    if (rerankEnabled && this.ai && topChunks.length > 1) {
      try {
        // High fidelity Reranking utilizing Gemini 3.5 Flash
        const items = topChunks.map((item, idx) => `[ID: ${idx}] ${item.chunk.text}`).join("\n\n");
        const reRankResponse = await this.ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: `You are an expert search re-ranker. Order the following document snippets by their relevance to this user search query: "${state.query}".
          
snippets:
${items}

Output a JSON array of index integers sorted from most relevant to least relevant (e.g. [2, 0, 1]). Respond ONLY with the JSON array, no explanation.`,
          config: {
            responseMimeType: "application/json",
          },
        });

        const ranks = JSON.parse(reRankResponse.text || "[]");
        if (Array.isArray(ranks) && ranks.length > 0) {
          const reordered: typeof topChunks = [];
          ranks.forEach((rankIndex) => {
            const idx = Number(rankIndex);
            if (topChunks[idx]) {
              reordered.push(topChunks[idx]);
            }
          });
          // Append any leftovers
          topChunks.forEach((item, idx) => {
            if (!ranks.includes(idx)) reordered.push(item);
          });
          topChunks = reordered;
        }
      } catch (err) {
        console.warn("Gemini reranker error, falling back to RRF rankings:", err);
      }
    }

    state.diagnostics.rerank_ms = Date.now() - start;
    return {
      ...state,
      rerankedChunks: topChunks.slice(0, 5), // Keep top 5 after reranking
    };
  }

  private async contextBuilderNode(state: AgentState): Promise<AgentState> {
    const start = Date.now();
    
    // Load standard prompt
    const promptTemplate = this.db.prompts?.find((p: any) => p.is_active)?.template_text || 
      `Answer the query using ONLY these source contexts. Cite references with bracketed numbers corresponding to the source number, like [1], [2]. If the sources do not contain the answer, say "Answer not found in documents."
Context sources:
{{context}}

User Query: {{query}}`;

    const contextCombined = state.rerankedChunks
      .map((item, idx) => `[Source ${idx + 1}]: ${item.chunk.text}`)
      .join("\n\n");

    // Include Conversation Memory context
    let memoryContext = "";
    if (state.memory) {
      memoryContext = `=== CONVERSATION MEMORY ===\nSummary: ${state.memory.summary || "No topic summary yet."}\nFacts: ${state.memory.important_facts?.join(", ") || "None."}\n\n`;
    }

    const compiled = compilePrompt(promptTemplate, {
      context: contextCombined,
      query: state.query,
    });

    state.promptText = memoryContext + compiled;
    state.contextString = contextCombined;

    return state;
  }

  private async modelRouterNode(state: AgentState): Promise<AgentState> {
    const start = Date.now();
    
    if (state.selectedModel && state.selectedModel !== "Auto") {
      state.modelRoutingReason = `Manual user override: ${state.selectedModel}`;
      state.costEstimate = state.selectedModel === "gemini-3.1-pro-preview" ? 0.00015 : 0.00003;
      return state;
    }

    const prefs = this.db.user_prefs?.[state.userId] || {};
    
    const decision = routeModel(state.query, state.contextString?.length || 0, prefs.llm_model);
    
    state.selectedModel = decision.model;
    state.modelRoutingReason = decision.reason;
    state.costEstimate = decision.costEstimate;
    
    return state;
  }
}
