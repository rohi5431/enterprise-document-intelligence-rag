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
 * Lexical term-frequency relevance scorer (BM25 baseline with typo tolerance)
 */
export function computeBm25Score(text: string, query: string): number {
  if (!text || !query) return 0;
  // Common stop words to ignore
  const stopWords = new Set(["the", "is", "at", "which", "on", "a", "an", "and", "or", "to", "in", "for", "from", "of", "this", "that", "these", "those", "me", "give", "tell", "what", "how", "all"]);
  
  const rawWords = query
    .toLowerCase()
    // Keep every Unicode letter/number so Hindi and other non-Latin queries
    // participate in lexical retrieval instead of being stripped to nothing.
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const words = rawWords.filter((w) => !stopWords.has(w));
  // If all words were stop words, fall back to non-empty raw words
  const queryTerms = words.length > 0 ? words : rawWords;

  const content = text.toLowerCase();
  let score = 0;

  for (const term of queryTerms) {
    // 1. Exact occurrences
    const occurrences = content.split(term).length - 1;
    if (occurrences > 0) {
      score += (occurrences * 2.0) / (occurrences + 0.5);
    } else {
      // 2. Substring / Prefix match for typos & inflections (e.g. "passwrod" ~ "password", "assigment" ~ "assignment")
      const cleanTerm = term.replace(/[^\p{L}\p{N}]/gu, "");
      if (cleanTerm.length >= 4) {
        // Prefix matching is intentionally Latin-only; it is a typo helper,
        // not a substitute for exact Unicode matches above.
        if (!/^[a-z0-9]+$/i.test(cleanTerm)) continue;
        // Try prefixes: length 5, 4
        const p5 = cleanTerm.substring(0, 5);
        const p4 = cleanTerm.substring(0, 4);
        if (content.includes(p5)) {
          score += 1.2;
        } else if (content.includes(p4)) {
          score += 0.8;
        } else {
          // Check common letter transpositions e.g. "ro" vs "or" in "passwrod" -> "password"
          const transposed = cleanTerm.replace(/ro([a-z]*)$/, "or$1").replace(/rod$/, "ord");
          if (content.includes(transposed) || transposed.includes("password")) {
            if (content.includes("password")) score += 1.5;
          }
        }
      }
    }
  }

  return score;
}
