export interface PromptTemplate {
  id: string;
  name: string;
  version: number;
  template_text: string;
  is_active: boolean;
  created_at: string;
  created_by: string;
  description: string;
}

const DEFAULT_PROMPT = `Answer the query using ONLY these source contexts. Cite references with bracketed numbers corresponding to the source number, like [1], [2]. If the sources do not contain the answer, say "Answer not found in documents."
CRITICAL: Respond in the exact language/locale of the query (e.g. Marathi, Hindi, Spanish, etc.).

Context sources:
{{context}}

User Query: {{query}}`;

const SYSTEM_ACCENTS_PROMPT = `You are a world-class enterprise research assistant.
You possess expert-level comprehension of technical, visual, and analytical documents.
Answer the query using ONLY these source contexts. Cite references with bracketed numbers corresponding to the source number, like [1], [2].
If the sources do not contain the answer, say "Answer not found in documents."
CRITICAL: Respond in the exact language/locale of the query. Keep the response elegant, crisp, and beautifully structured.

Context sources:
{{context}}

User Query: {{query}}`;

/**
 * Initializes default prompts if not already present in the database.
 */
export function getInitialPrompts(): PromptTemplate[] {
  return [
    {
      id: "prompt_standard_v1",
      name: "standard_rag",
      version: 1,
      template_text: DEFAULT_PROMPT,
      is_active: true,
      created_at: new Date().toISOString(),
      created_by: "system",
      description: "Default standard enterprise RAG prompt template.",
    },
    {
      id: "prompt_advanced_v1",
      name: "advanced_rag",
      version: 1,
      template_text: SYSTEM_ACCENTS_PROMPT,
      is_active: false,
      created_at: new Date().toISOString(),
      created_by: "system",
      description: "Advanced semantic RAG assistant prompt with styling constraints.",
    }
  ];
}

/**
 * Generates the full prompt by replacing placeholders.
 */
export function compilePrompt(template: string, replacements: Record<string, string>): string {
  let compiled = template;
  Object.entries(replacements).forEach(([key, value]) => {
    compiled = compiled.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), value);
  });
  return compiled;
}
