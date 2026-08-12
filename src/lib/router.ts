/**
 * Dynamic Model Router
 * Routes incoming queries to the optimal model based on complexity, size, cost, and latency.
 */

export interface RoutingDecision {
  model: string;
  reason: string;
  costEstimate: number;
}

const COMPLEXITY_KEYWORDS = [
  "compare", "analyze", "evaluate", "why", "how to", "optimize", 
  "architecture", "explain step-by-step", "code", "refactor", 
  "diagram", "proof", "mathematical", "simulate"
];

/**
 * Automatically determines which Gemini model is best suited for the query
 */
export function routeModel(
  query: string,
  contextLength: number,
  manualOverride?: string | null
): RoutingDecision {
  // If user forced a model manually, respect it
  if (manualOverride && manualOverride !== "auto" && manualOverride !== "") {
    return {
      model: manualOverride,
      reason: `Manual override specified: ${manualOverride}`,
      costEstimate: manualOverride.includes("pro") ? 0.0015 : 0.00015,
    };
  }

  const queryLower = query.toLowerCase();
  
  // Rule 1: High Context Length (e.g. over 80,000 characters) - Route to Pro for high fidelity context modeling
  if (contextLength > 80000) {
    return {
      model: "gemini-3.1-pro-preview",
      reason: `Context payload is large (${Math.round(contextLength / 1000)}k chars). Routed to Pro for deeper recall.`,
      costEstimate: 0.0015,
    };
  }

  // Rule 2: Question complexity checks
  const isComplex = COMPLEXITY_KEYWORDS.some((kw) => queryLower.includes(kw)) || query.length > 250;
  if (isComplex) {
    return {
      model: "gemini-3.1-pro-preview",
      reason: "Query exhibits high semantic complexity (keywords/analytical nature). Routed to Pro.",
      costEstimate: 0.0015,
    };
  }

  // Default: Flash (High speed, extremely cost-effective)
  return {
    model: "gemini-3.5-flash",
    reason: "Simple informational lookup. Routed to Flash for optimal speed and cost-efficiency.",
    costEstimate: 0.00015,
  };
}
