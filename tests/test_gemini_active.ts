import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

async function test() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const ai = new GoogleGenAI({ apiKey });

  for (const m of ["gemini-2.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"]) {
    const t0 = Date.now();
    try {
      const res = await ai.models.generateContent({
        model: m,
        contents: "Reply with 'PONG' only.",
      });
      console.log(`✓ ${m}: SUCCESS in ${Date.now() - t0}ms. Output: "${res.text?.trim()}"`);
    } catch (e: any) {
      console.log(`✗ ${m}: FAILED in ${Date.now() - t0}ms: ${e.message}`);
    }
  }
}

test().catch(console.error);
