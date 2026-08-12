import { GoogleGenAI } from "@google/genai";

export interface ExtractedMetadata {
  department: string;
  tags: string[];
  document_type: string;
  security_level: "public" | "internal" | "restricted" | "confidential";
  author: string;
  language: string;
  workspace: string;
}

export interface ParentChunk {
  id: string;
  doc_id: number;
  text: string;
  page_number: number;
}

export interface ChildChunk {
  id: string;
  doc_id: number;
  parent_id: string;
  text: string;
  page_number: number;
  embedding: number[] | null;
}

/**
 * Use Gemini to extract metadata from document content
 */
export async function extractDocumentMetadata(
  ai: GoogleGenAI | null,
  filename: string,
  content: string
): Promise<ExtractedMetadata> {
  const defaultMeta: ExtractedMetadata = {
    department: "General",
    tags: ["unassigned"],
    document_type: filename.split(".").pop()?.toUpperCase() || "TXT",
    security_level: "internal",
    author: "User",
    language: "English",
    workspace: "Default Workspace",
  };

  if (!ai || content.length < 50) {
    return defaultMeta;
  }

  try {
    const sample = content.substring(0, 3000);
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `You are an advanced document classification engine. Analyze the following document text sample and output a JSON object containing classification metadata:
1. "department": One word department (e.g., "Engineering", "Legal", "HR", "Sales", "Finance", "General")
2. "tags": Array of 2-3 short lowercase tags
3. "document_type": Type of document (e.g., "Architecture Guide", "SOP", "Invoice", "Meeting Notes", "Policy")
4. "security_level": One of "public", "internal", "restricted", "confidential"
5. "author": Name of author if found, else "Unknown"
6. "language": Language of the text (e.g., "English", "Spanish", "Marathi", "Hindi")
7. "workspace": A relevant team workspace name (e.g., "DevOps", "Corporate Strategy")

Filename: ${filename}
Sample Text:
${sample}

Respond ONLY with the JSON object. Do not include markdown tags, conversational wrappers, or preamble.
Example: {"department": "HR", "tags": ["benefits", "policy"], "document_type": "Policy", "security_level": "internal", "author": "John Doe", "language": "English", "workspace": "Human Resources"}`,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text?.trim() || "";
    if (text) {
      const parsed = JSON.parse(text);
      return {
        department: parsed.department || defaultMeta.department,
        tags: parsed.tags || defaultMeta.tags,
        document_type: parsed.document_type || defaultMeta.document_type,
        security_level: parsed.security_level || defaultMeta.security_level,
        author: parsed.author || defaultMeta.author,
        language: parsed.language || defaultMeta.language,
        workspace: parsed.workspace || defaultMeta.workspace,
      };
    }
  } catch (err) {
    console.error("Metadata extraction error:", err);
  }

  return defaultMeta;
}

/**
 * Clean text helper
 */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}

/**
 * Generates Parent-Child Chunks from text
 */
export function generateParentChildChunks(
  text: string,
  docId: number,
  parentSize = 1500,
  childSize = 300,
  overlap = 50
): { parents: ParentChunk[]; children: ChildChunk[] } {
  const cleaned = cleanText(text);
  const parents: ParentChunk[] = [];
  const children: ChildChunk[] = [];

  // 1. Chunk parents first (logical paragraphs/blocks)
  const paragraphBlocks = cleaned.split(/\n\n+/).filter((p) => p.trim().length > 10);
  let accumulated = "";
  let pageCounter = 1;
  let parentIndex = 1;

  for (const block of paragraphBlocks) {
    if ((accumulated + "\n\n" + block).length > parentSize && accumulated.length > 0) {
      const parentId = `parent_${docId}_${parentIndex++}`;
      parents.push({
        id: parentId,
        doc_id: docId,
        text: accumulated.trim(),
        page_number: pageCounter,
      });

      // Split parent into multiple child chunks
      const childTexts = chunkString(accumulated, childSize, overlap);
      childTexts.forEach((cText, cIdx) => {
        children.push({
          id: `child_${parentId}_${cIdx + 1}`,
          doc_id: docId,
          parent_id: parentId,
          text: cText,
          page_number: pageCounter,
          embedding: null,
        });
      });

      accumulated = block;
      if (parentIndex % 3 === 0) pageCounter++;
    } else {
      accumulated = accumulated ? accumulated + "\n\n" + block : block;
    }
  }

  if (accumulated.trim().length > 0) {
    const parentId = `parent_${docId}_${parentIndex++}`;
    parents.push({
      id: parentId,
      doc_id: docId,
      text: accumulated.trim(),
      page_number: pageCounter,
    });

    const childTexts = chunkString(accumulated, childSize, overlap);
    childTexts.forEach((cText, cIdx) => {
      children.push({
        id: `child_${parentId}_${cIdx + 1}`,
        doc_id: docId,
        parent_id: parentId,
        text: cText,
        page_number: pageCounter,
        embedding: null,
      });
    });
  }

  return { parents, children };
}

function chunkString(str: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let startIndex = 0;
  while (startIndex < str.length) {
    let endIndex = startIndex + size;
    if (endIndex < str.length) {
      const lastSpace = str.lastIndexOf(" ", endIndex);
      if (lastSpace > startIndex + size - 50) {
        endIndex = lastSpace;
      }
    } else {
      endIndex = str.length;
    }
    const chunk = str.slice(startIndex, endIndex).trim();
    if (chunk.length > 5) {
      chunks.push(chunk);
    }
    startIndex = endIndex - overlap;
    if (startIndex >= str.length - overlap) break;
  }
  return chunks;
}
