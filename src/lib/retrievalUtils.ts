/**
 * Similarity and Lexical Retrieval Utilities
 */

/**
 * Calculates the cosine similarity of two numerical vector arrays
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

/**
 * Lexical term-frequency relevance scorer (BM25 baseline)
 */
export function computeBm25Score(text: string, query: string): number {
  if (!text || !query) return 0;
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const content = text.toLowerCase();
  let score = 0;
  for (const word of words) {
    const occurrences = content.split(word).length - 1;
    if (occurrences > 0) {
      score += (occurrences * 1.5) / (occurrences + 0.5); // BM25 term saturation index
    }
  }
  return score;
}
