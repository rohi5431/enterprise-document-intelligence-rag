import { GoogleGenAI } from "@google/genai";

export interface SessionMemory {
  summary: string;
  important_facts: string[];
  context_window_size: number;
  recent_history: { role: string; content: string }[];
  user_preferences: Record<string, any>;
}

/**
 * Generates/updates the session summary and key facts using Gemini
 */
export async function updateSessionMemory(
  ai: GoogleGenAI | null,
  messages: { role: string; content: string }[],
  currentMemory: SessionMemory
): Promise<SessionMemory> {
  const updated = { ...currentMemory };
  
  // Keep the last 6 messages in history for the context window
  updated.recent_history = messages.slice(-6);

  if (!ai || messages.length < 2) {
    return updated;
  }

  try {
    // Compile history for context
    const historyText = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `You are an enterprise knowledge memory manager. Review the following conversation history and output a JSON object containing:
1. "summary": A very short, concise, high-level summary of the ongoing topic (max 2 sentences).
2. "facts": An array of important user preferences, constraints, or factual details mentioned (e.g., "User prefers python code", "User is researching RAG architecture"). Include facts only if explicitly mentioned.

Conversation history:
${historyText}

Respond ONLY with the JSON object. Do not include any markdown styling, tags, or conversational text.
Example structure: {"summary": "Brief summary text", "facts": ["fact 1", "fact 2"]}`,
      config: {
        responseMimeType: "application/json",
      },
    });

    const resultText = response.text?.trim() || "";
    if (resultText) {
      const parsed = JSON.parse(resultText);
      updated.summary = parsed.summary || currentMemory.summary;
      
      // Merge unique facts
      const newFacts = parsed.facts || [];
      const combinedFacts = new Set([...currentMemory.important_facts, ...newFacts]);
      updated.important_facts = Array.from(combinedFacts).slice(0, 10); // cap at 10 facts
    }
  } catch (err) {
    console.error("Memory update error:", err);
  }

  return updated;
}

/**
 * Format conversation memory as a prompt instruction
 */
export function getSessionMemoryContext(memory?: SessionMemory): string {
  if (!memory) return "";
  
  let text = "\n=== PERSISTENT CONVERSATION MEMORY ===\n";
  if (memory.summary) {
    text += `Topic Summary: ${memory.summary}\n`;
  }
  if (memory.important_facts && memory.important_facts.length > 0) {
    text += "Known Facts & User Constraints:\n";
    memory.important_facts.forEach((fact) => {
      text += `- ${fact}\n`;
    });
  }
  text += "======================================\n\n";
  return text;
}
