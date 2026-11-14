import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const ai = new GoogleGenAI({ apiKey });

  try {
    const pager = await ai.models.list();
    console.log("Listing available models:");
    let count = 0;
    for await (const m of pager) {
      console.log(`- ${m.name} (${m.displayName})`);
      count++;
      if (count > 20) break;
    }
  } catch (err: any) {
    console.error("List models error:", err.message);
  }
}

listModels().catch(console.error);
