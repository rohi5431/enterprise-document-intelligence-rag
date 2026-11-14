import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

async function probe() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.log("No GEMINI_API_KEY found");
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  const candidateModels = [
    process.env.GEMINI_MODEL?.trim(),
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ].filter(Boolean) as string[];

  console.log("Testing candidate Gemini models with configured API key...");

  for (const model of candidateModels) {
    const start = Date.now();
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: "Hi",
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout after 6s")), 6000)),
      ]) as any;

      const dur = Date.now() - start;
      console.log(`✓ Model "${model}": SUCCESS in ${dur}ms. Text: "${response.text?.trim()}"`);
      return model;
    } catch (err: any) {
      console.log(`✗ Model "${model}": FAILED in ${Date.now() - start}ms: ${err.message}`);
    }
  }
}

probe().catch(console.error);
