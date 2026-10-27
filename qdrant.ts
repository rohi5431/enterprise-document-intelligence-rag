import crypto from "crypto";

export type QdrantChunk = {
  id: string;
  doc_id: number;
  text: string;
  page_number: number;
  parent_id?: string | null;
  embedding: number[] | null;
};

type QdrantResponse<T> = { status: string; result: T };

/**
 * Small server-side Qdrant REST client.  Keeping this behind the API server
 * prevents the Qdrant API key from ever being sent to the browser bundle.
 */
export class QdrantStore {
  private readonly url = process.env.QDRANT_URL?.replace(/\/$/, "") || "";
  private readonly apiKey = process.env.QDRANT_API_KEY?.trim() || "";
  readonly collection = process.env.QDRANT_COLLECTION_NAME?.trim() || "ContextRag";

  get configured() {
    return Boolean(this.url && this.apiKey);
  }

  private headers(json = false): Record<string, string> {
    return {
      "api-key": this.apiKey,
      ...(json ? { "content-type": "application/json" } : {}),
    };
  }

  private async request<T>(path: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<T> {
    if (!this.configured) throw new Error("QDRANT_URL or QDRANT_API_KEY is not configured.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.url}${path}`, {
        ...init,
        headers: { ...this.headers(Boolean(init.body)), ...(init.headers || {}) },
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Qdrant returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
      }
      return await response.json() as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private pointId(chunkId: string): string {
    const bytes = Buffer.from(crypto.createHash("sha256").update(chunkId).digest().subarray(0, 16));
    // RFC 4122 variant/version bits make this a valid UUID accepted by Qdrant.
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async getHealth() {
    if (!this.configured) return { status: "not_configured", message: "Set QDRANT_URL and QDRANT_API_KEY to enable vector search." };
    const startedAt = Date.now();
    try {
      // Qdrant's endpoint returns { result: { collections: [...] } }, not a
      // bare array. Normalise it defensively so dashboard monitoring works
      // across cloud/server versions.
      const collectionsResponse = await this.request<QdrantResponse<{ collections?: Array<{ name: string }> } | Array<{ name: string }>>>("/collections", {}, 8_000);
      const collections = Array.isArray(collectionsResponse.result)
        ? collectionsResponse.result
        : collectionsResponse.result?.collections || [];
      const exists = collections.some((item) => item.name === this.collection);
      if (!exists) {
        return {
          status: "ok",
          latency_ms: Date.now() - startedAt,
          collection_count: collections.length,
          vector_count: 0,
          message: `Connected. Collection \"${this.collection}\" will be created when the first embedding is indexed.`,
        };
      }
      const info = await this.request<QdrantResponse<any>>(`/collections/${encodeURIComponent(this.collection)}`, {}, 8_000);
      return {
        status: "ok",
        latency_ms: Date.now() - startedAt,
        collection_count: collections.length,
        vector_count: info.result?.vectors_count ?? info.result?.points_count ?? 0,
        collection: this.collection,
      };
    } catch (error) {
      return { status: "error", latency_ms: null, message: error instanceof Error ? error.message : "Qdrant health check failed." };
    }
  }

  async upsert(chunks: QdrantChunk[], userId: number): Promise<void> {
    const indexed = chunks.filter((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length > 0);
    if (!indexed.length || !this.configured) return;

    const vectorSize = indexed[0].embedding!.length;
    const collectionPath = `/collections/${encodeURIComponent(this.collection)}`;
    try {
      await this.request<QdrantResponse<unknown>>(collectionPath);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("404")) throw error;
      await this.request<QdrantResponse<unknown>>(collectionPath, {
        method: "PUT",
        body: JSON.stringify({ vectors: { size: vectorSize, distance: "Cosine" } }),
      });
    }

    // Cloud Qdrant requires payload indexes before a filtered search. Without
    // these, `user_id` filtering returns HTTP 400 even though points exist.
    for (const fieldName of ["user_id", "doc_id"]) {
      await this.request<QdrantResponse<unknown>>(`${collectionPath}/index`, {
        method: "PUT",
        body: JSON.stringify({ field_name: fieldName, field_schema: "integer" }),
      });
    }

    await this.request<QdrantResponse<unknown>>(`${collectionPath}/points?wait=true`, {
      method: "PUT",
      body: JSON.stringify({
        points: indexed.map((chunk) => ({
          id: this.pointId(chunk.id),
          vector: chunk.embedding,
          payload: {
            source_chunk_id: chunk.id,
            doc_id: chunk.doc_id,
            user_id: userId,
            text: chunk.text,
            page_number: chunk.page_number,
            parent_id: chunk.parent_id || null,
          },
        })),
      }),
    });
  }

  async deleteDocument(docId: number, userId: number): Promise<void> {
    if (!this.configured) return;
    try {
      await this.request<QdrantResponse<unknown>>(`/collections/${encodeURIComponent(this.collection)}/points/delete?wait=true`, {
        method: "POST",
        body: JSON.stringify({ filter: { must: [
          { key: "doc_id", match: { value: docId } },
          { key: "user_id", match: { value: userId } },
        ] } }),
      });
    } catch (error) {
      // A document can legitimately have no collection yet.  Surface all other failures.
      if (!(error instanceof Error) || !error.message.includes("404")) throw error;
    }
  }

  async search(vector: number[], userId: number, limit: number, documentIds?: number[]) {
    if (!this.configured || !vector.length) return [] as Array<{ chunkId: string; score: number }>;
    const must: any[] = [{ key: "user_id", match: { value: userId } }];
    if (documentIds?.length) must.push({ key: "doc_id", match: { any: documentIds } });
    const response = await this.request<QdrantResponse<Array<any>>>(`/collections/${encodeURIComponent(this.collection)}/points/search`, {
      method: "POST",
      body: JSON.stringify({ vector, limit, with_payload: ["source_chunk_id"], filter: { must } }),
    });
    return response.result
      .filter((point) => point.payload?.source_chunk_id)
      .map((point) => ({ chunkId: String(point.payload.source_chunk_id), score: Number(point.score) || 0 }));
  }
}
