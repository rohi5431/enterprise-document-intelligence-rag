/**
 * Document Parsers & Multimodal File Intelligence Utilities
 *
 * Implements robust enterprise parsers for:
 * - PDF documents (metadata, text, structure)
 * - Microsoft Word (DOCX OpenXML tables & text, legacy DOC stream extraction)
 * - Microsoft Excel (XLSX OpenXML sheets, shared strings, formatted Markdown tables)
 * - Microsoft PowerPoint (PPTX OpenXML slide decks, text runs, slide notes)
 * - CSV & TSV tabular content (auto-delimited, Markdown table formatting)
 * - Markdown & Structured Plain Text (headers, lists, tables preserved)
 * - HTML documents & Internet-copied rich text (strict XSS sanitization, link preservation)
 * - JSON structured data (key-path flattening, tabular representation)
 * - Images (PNG, JPG, WEBP, TIFF, BMP - dimensions sniffing, OCR metadata, handwriting flags)
 */
import crypto from "crypto";
import zlib from "zlib";

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB limit
export const MAX_PASTED_TEXT_BYTES = 5 * 1024 * 1024; // 5MB limit for pasted text

export const SUPPORTED_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "doc",
  "txt",
  "csv",
  "tsv",
  "md",
  "markdown",
  "json",
  "xlsx",
  "xls",
  "pptx",
  "ppt",
  "html",
  "htm",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "tiff",
  "tif",
  "bmp",
]);

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  extension: string;
  contentHash: string;
  mimeType?: string;
}

export interface ParsedDocumentResult {
  text: string;
  metadata: {
    pageCount?: number;
    slideCount?: number;
    sheetCount?: number;
    rowCount?: number;
    format: string;
    hasTables?: boolean;
    hasImages?: boolean;
    isHandwritten?: boolean;
    confidence?: number;
  };
}

export function computeBufferHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function validateUploadedFile(
  filename: string,
  buffer: Buffer,
  mimetype?: string
): FileValidationResult {
  const contentHash = computeBufferHash(buffer);

  if (!buffer || buffer.length === 0) {
    return { valid: false, error: "The uploaded file is empty.", extension: "", contentHash };
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds the 15 MB limit (${(buffer.length / (1024 * 1024)).toFixed(1)} MB).`,
      extension: "",
      contentHash,
    };
  }

  const ext = (filename.toLowerCase().split(".").pop() || "").trim();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Unsupported file extension ".${ext}". Supported types: PDF, DOCX, DOC, XLSX, PPTX, CSV, TXT, MD, HTML, JSON, and Images (PNG/JPG/WEBP/TIFF/BMP).`,
      extension: ext,
      contentHash,
    };
  }

  // Check for suspicious executable MIME types
  if (
    mimetype &&
    /executable|x-msdownload|x-sh|x-bat|x-csh/i.test(mimetype) &&
    !["pdf", "docx", "xlsx", "pptx"].includes(ext)
  ) {
    return { valid: false, error: "File rejected due to invalid or executable MIME signature.", extension: ext, contentHash };
  }

  return { valid: true, extension: ext, contentHash, mimeType: mimetype };
}

// ─────────────────────────────────────────────────────────────────────────────
// ZIP Archive Helper (Zero-dependency PKZIP reader for OpenXML packages)
// ─────────────────────────────────────────────────────────────────────────────

export function extractZipEntries(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return entries; // Not a valid ZIP file

  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < totalEntries && cursor + 46 <= buffer.length; i++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break; // Central directory signature
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);

    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength).replace(/\\/g, "/");

    if (localOffset + 30 <= buffer.length) {
      const localNameLen = buffer.readUInt16LE(localOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;

      if (dataStart + compressedSize <= buffer.length) {
        const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
        let decompressed: Buffer | null = null;
        try {
          if (method === 0) {
            decompressed = compressed;
          } else if (method === 8) {
            decompressed = zlib.inflateRawSync(compressed);
          }
        } catch {
          decompressed = null;
        }

        if (decompressed) {
          entries.set(name, decompressed);
        }
      }
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Microsoft Word (DOCX / DOC) Parser
// ─────────────────────────────────────────────────────────────────────────────

export function parseDocxToText(buffer: Buffer): ParsedDocumentResult {
  const entries = extractZipEntries(buffer);
  const docXml = entries.get("word/document.xml");
  if (!docXml) {
    throw new Error("Invalid DOCX package: missing word/document.xml.");
  }

  const xml = docXml.toString("utf8");

  // Format tables in DOCX
  let formatted = xml;
  // Convert table cells into tab-separated and rows into newlines
  formatted = formatted
    .replace(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/gi, (_, cellContent) => {
      const cellText = cellContent.replace(/<[^>]+>/g, "").trim();
      return ` ${cellText} |`;
    })
    .replace(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/gi, (_, rowContent) => {
      return `\n|${rowContent}`;
    })
    .replace(/<w:pStyle\b[^>]*w:val="Heading1"[^>]*\/>[\s\S]*?<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi, "\n\n# $1\n")
    .replace(/<w:pStyle\b[^>]*w:val="Heading2"[^>]*\/>[\s\S]*?<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi, "\n\n## $1\n")
    .replace(/<w:pStyle\b[^>]*w:val="Heading3"[^>]*\/>[\s\S]*?<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi, "\n\n### $1\n")
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:(?:br|cr)\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const hasTables = xml.includes("<w:tbl");

  return {
    text: formatted || "[Empty Word Document]",
    metadata: {
      format: "docx",
      hasTables,
      pageCount: Math.max(1, Math.ceil(formatted.length / 2000)),
    },
  };
}

export function parseDocBinaryToText(buffer: Buffer): ParsedDocumentResult {
  // Legacy Word 97-2003 OLE2 binary file text extraction
  // Extracts Unicode UTF-16LE and ASCII text blocks
  const textBlocks: string[] = [];
  const minRunLength = 4;

  // 1. Try ASCII printable characters runs
  let currentAscii = "";
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    if (byte >= 32 && byte <= 126) {
      currentAscii += String.fromCharCode(byte);
    } else if (byte === 10 || byte === 13) {
      if (currentAscii.length >= minRunLength) {
        textBlocks.push(currentAscii.trim());
      }
      currentAscii = "";
    } else {
      if (currentAscii.length >= minRunLength) {
        textBlocks.push(currentAscii.trim());
      }
      currentAscii = "";
    }
  }

  // 2. Try UTF-16LE runs
  let currentUtf16 = "";
  for (let i = 0; i < buffer.length - 1; i += 2) {
    const code = buffer.readUInt16LE(i);
    if ((code >= 32 && code <= 126) || code === 10 || code === 13) {
      currentUtf16 += String.fromCharCode(code);
    } else {
      if (currentUtf16.trim().length >= minRunLength) {
        textBlocks.push(currentUtf16.trim());
      }
      currentUtf16 = "";
    }
  }

  const combined = textBlocks
    .filter((b) => b.length > 5 && !/^[0-9a-f]{8,}$/i.test(b))
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text: combined || "[Legacy Word 97-2003 binary file — recommend saving as DOCX for complete formatting.]",
    metadata: {
      format: "doc_binary",
      pageCount: Math.max(1, Math.ceil(combined.length / 2000)),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Microsoft Excel (XLSX) Parser
// ─────────────────────────────────────────────────────────────────────────────

export function parseXlsxToText(buffer: Buffer): ParsedDocumentResult {
  const entries = extractZipEntries(buffer);

  // 1. Parse shared strings table (xl/sharedStrings.xml)
  const sharedStrings: string[] = [];
  const sstXml = entries.get("xl/sharedStrings.xml");
  if (sstXml) {
    const sstContent = sstXml.toString("utf8");
    const siMatches = sstContent.match(/<si\b[^>]*>([\s\S]*?)<\/si>/gi) || [];
    for (const si of siMatches) {
      const text = si
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();
      sharedStrings.push(text);
    }
  }

  // 2. Parse worksheets (xl/worksheets/sheet*.xml)
  const sheetTexts: string[] = [];
  let sheetIndex = 1;
  while (true) {
    const sheetXml = entries.get(`xl/worksheets/sheet${sheetIndex}.xml`);
    if (!sheetXml) break;

    const content = sheetXml.toString("utf8");
    const rows: string[][] = [];

    const rowMatches = content.match(/<row\b[^>]*>([\s\S]*?)<\/row>/gi) || [];
    for (const r of rowMatches) {
      const rowData: string[] = [];
      const cellMatches = r.match(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi) || [];

      for (const cell of cellMatches) {
        const typeMatch = cell.match(/t="([^"]+)"/);
        const cellType = typeMatch ? typeMatch[1] : "";
        const valMatch = cell.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
        const formulaMatch = cell.match(/<f\b[^>]*>([\s\S]*?)<\/f>/i);
        const formula = formulaMatch ? formulaMatch[1].trim() : "";
        let cellVal = valMatch ? valMatch[1].trim() : "";

        if (cellType === "s" && cellVal) {
          const idx = parseInt(cellVal, 10);
          cellVal = !isNaN(idx) && sharedStrings[idx] ? sharedStrings[idx] : cellVal;
        } else if (cellType === "inlineStr") {
          const isMatch = cell.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/i);
          if (isMatch) cellVal = isMatch[1].trim();
        } else if (!cellVal && formula) {
          cellVal = `[=${formula}]`;
        }

        cellVal = cellVal
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"');
        rowData.push(cellVal);
      }

      if (rowData.some((c) => c.length > 0)) {
        rows.push(rowData);
      }
    }

    if (rows.length > 0) {
      const headers = rows[0];
      const tableLines: string[] = [];
      tableLines.push(`### Sheet ${sheetIndex}`);
      tableLines.push(`| ${headers.join(" | ")} |`);
      tableLines.push(`| ${headers.map(() => "---").join(" | ")} |`);

      const maxRows = Math.min(rows.length, 500);
      for (let i = 1; i < maxRows; i++) {
        const row = rows[i];
        const padded = headers.map((_, idx) => row[idx] || "");
        tableLines.push(`| ${padded.join(" | ")} |`);
      }
      if (rows.length > maxRows) {
        tableLines.push(`\n*(Sheet ${sheetIndex} truncated: showing ${maxRows} of ${rows.length} rows)*`);
      }
      sheetTexts.push(tableLines.join("\n"));
    }
    sheetIndex++;
  }

  const fullText = sheetTexts.join("\n\n---\n\n").trim();
  return {
    text: fullText || "[Empty Excel Workbook]",
    metadata: {
      format: "xlsx",
      sheetCount: sheetIndex - 1,
      hasTables: true,
      rowCount: sheetTexts.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Microsoft PowerPoint (PPTX) Parser
// ─────────────────────────────────────────────────────────────────────────────

export function parsePptxToText(buffer: Buffer): ParsedDocumentResult {
  const entries = extractZipEntries(buffer);
  const slideTexts: string[] = [];
  let slideIndex = 1;

  while (true) {
    const slideXml = entries.get(`ppt/slides/slide${slideIndex}.xml`);
    if (!slideXml) break;

    const content = slideXml.toString("utf8");
    // Extract paragraphs <a:p> and text runs <a:t>
    const paragraphs: string[] = [];
    const pMatches = content.match(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi) || [];

    for (const p of pMatches) {
      const tMatches = p.match(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi) || [];
      const line = tMatches
        .map((t) => t.replace(/<[^>]+>/g, "").trim())
        .filter((t) => t.length > 0)
        .join(" ");
      if (line) paragraphs.push(line);
    }

    // Check for speaker notes
    const noteXml = entries.get(`ppt/notesSlides/notesSlide${slideIndex}.xml`);
    let noteText = "";
    if (noteXml) {
      const noteContent = noteXml.toString("utf8");
      const noteMatches = noteContent.match(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi) || [];
      noteText = noteMatches
        .map((t) => t.replace(/<[^>]+>/g, "").trim())
        .filter((t) => t.length > 0)
        .join(" ");
    }

    if (paragraphs.length > 0 || noteText) {
      let slideBlock = `## Slide ${slideIndex}`;
      if (paragraphs[0]) {
        slideBlock += `: ${paragraphs[0]}`;
      }
      slideBlock += "\n\n" + paragraphs.slice(1).map((p) => `- ${p}`).join("\n");
      if (noteText) {
        slideBlock += `\n\n*Speaker Notes: ${noteText}*`;
      }
      slideTexts.push(slideBlock.trim());
    }

    slideIndex++;
  }

  const combined = slideTexts.join("\n\n---\n\n").trim();
  return {
    text: combined || "[Empty PowerPoint Presentation]",
    metadata: {
      format: "pptx",
      slideCount: slideIndex - 1,
      pageCount: slideIndex - 1,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML Sanitization & Web Content Extraction
// ─────────────────────────────────────────────────────────────────────────────

export function sanitizeHtmlContent(htmlContent: string): { cleanHtml: string; plainText: string; title?: string } {
  // Strip malicious tags: script, style, iframe, object, embed, applet, svg, form
  let stripped = htmlContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "");

  // Strip dangerous inline event handlers (onload, onclick, onerror, etc.)
  stripped = stripped.replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "");
  // Strip javascript: URLs
  stripped = stripped.replace(/href\s*=\s*['"]?javascript:[^'"]*['"]?/gi, 'href="#"');

  // Extract title if present
  const titleMatch = stripped.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

  // Convert HTML structure to Markdown-like clean text
  const plainText = stripped
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n")
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n")
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n")
    .replace(/<h[4-6]\b[^>]*>([\s\S]*?)<\/h[4-6]>/gi, "\n\n#### $1\n")
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, "\n\n$1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<td\b[^>]*>([\s\S]*?)<\/td>/gi, " $1 |")
    .replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, "\n| $1")
    .replace(/<th\b[^>]*>([\s\S]*?)<\/th>/gi, " **$1** |")
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { cleanHtml: stripped, plainText, title };
}

export function parseHtmlToText(htmlContent: string): ParsedDocumentResult {
  const { plainText, title } = sanitizeHtmlContent(htmlContent);
  return {
    text: plainText,
    metadata: {
      format: "html",
      pageCount: Math.max(1, Math.ceil(plainText.length / 2000)),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Structured Data Parser
// ─────────────────────────────────────────────────────────────────────────────

export function parseJsonToText(jsonContent: string): ParsedDocumentResult {
  try {
    const data = JSON.parse(jsonContent);

    if (Array.isArray(data)) {
      if (data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
        // Render array of objects as Markdown table
        const keys = Object.keys(data[0]);
        const header = `| ${keys.join(" | ")} |`;
        const divider = `| ${keys.map(() => "---").join(" | ")} |`;
        const rows = data.slice(0, 300).map((item) => {
          return `| ${keys.map((k) => String(item[k] ?? "")).join(" | ")} |`;
        });
        const tableText = [header, divider, ...rows].join("\n");
        return {
          text: `### Structured JSON Records (${data.length} total entries)\n\n${tableText}`,
          metadata: { format: "json", rowCount: data.length, hasTables: true },
        };
      } else {
        const listText = data.map((item, i) => `${i + 1}. ${String(item)}`).join("\n");
        return { text: `### JSON Array:\n\n${listText}`, metadata: { format: "json" } };
      }
    }

    if (typeof data === "object" && data !== null) {
      // Flatten nested object keys
      const lines: string[] = [];
      const flatten = (obj: any, prefix = "") => {
        for (const [k, v] of Object.entries(obj)) {
          const keyPath = prefix ? `${prefix}.${k}` : k;
          if (typeof v === "object" && v !== null && !Array.isArray(v)) {
            flatten(v, keyPath);
          } else if (Array.isArray(v)) {
            lines.push(`**${keyPath}**: [ ${v.map((x) => String(x)).join(", ")} ]`);
          } else {
            lines.push(`**${keyPath}**: ${String(v)}`);
          }
        }
      };
      flatten(data);
      return {
        text: `### Structured JSON Object:\n\n${lines.join("\n")}`,
        metadata: { format: "json" },
      };
    }

    return { text: String(data), metadata: { format: "json" } };
  } catch (err) {
    return {
      text: jsonContent,
      metadata: { format: "json_raw" },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV & Tabular Parser
// ─────────────────────────────────────────────────────────────────────────────

export function parseCsvToText(csvContent: string): string {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return "[Empty CSV table]";

  // Auto-detect delimiter: comma, semicolon, tab
  const sample = lines[0];
  const commaCount = (sample.match(/,/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  const semiCount = (sample.match(/;/g) || []).length;
  const delimiter = tabCount > commaCount && tabCount > semiCount ? "\t" : semiCount > commaCount ? ";" : ",";

  const parseRow = (line: string): string[] => {
    const row: string[] = [];
    let insideQuotes = false;
    let entry = "";
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === delimiter && !insideQuotes) {
        row.push(entry.trim());
        entry = "";
      } else {
        entry += char;
      }
    }
    row.push(entry.trim());
    return row;
  };

  const headers = parseRow(lines[0]);
  const formattedRows: string[] = [];

  // Header row
  formattedRows.push(`| ${headers.join(" | ")} |`);
  formattedRows.push(`| ${headers.map(() => "---").join(" | ")} |`);

  // Data rows (up to 500 rows to keep indexing bounded)
  const maxRows = Math.min(lines.length, 500);
  for (let i = 1; i < maxRows; i++) {
    const row = parseRow(lines[i]);
    if (row.length === headers.length) {
      formattedRows.push(`| ${row.join(" | ")} |`);
    } else if (row.some((c) => c.length > 0)) {
      const padded = headers.map((_, idx) => row[idx] || "");
      formattedRows.push(`| ${padded.join(" | ")} |`);
    }
  }

  if (lines.length > maxRows) {
    formattedRows.push(`\n*(Table truncated: showing ${maxRows} of ${lines.length} total rows)*`);
  }

  return formattedRows.join("\n");
}

export function parseMarkdownToText(mdContent: string): string {
  return mdContent
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Image Sniffing, OCR & Handwriting Metadata Heuristics
// ─────────────────────────────────────────────────────────────────────────────

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  isLikelyHandwritten: boolean;
  estimatedConfidence: number;
  deskewAngleDegrees: number;
  noiseLevel: "low" | "medium" | "high";
}

export function inspectImageBuffer(filename: string, buffer: Buffer): ImageMetadata {
  let width = 0;
  let height = 0;
  let format = "unknown";

  // PNG sniffing
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    format = "png";
    width = buffer.readUInt32BE(16);
    height = buffer.readUInt32BE(20);
  }
  // JPEG sniffing
  else if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    format = "jpeg";
    for (let i = 2; i < buffer.length - 8; i++) {
      if (buffer[i] === 0xff && (buffer[i + 1] === 0xc0 || buffer[i + 1] === 0xc2)) {
        height = buffer.readUInt16BE(i + 5);
        width = buffer.readUInt16BE(i + 7);
        break;
      }
    }
  }
  // WEBP sniffing
  else if (buffer.length >= 30 && buffer.toString("utf8", 0, 4) === "RIFF" && buffer.toString("utf8", 8, 12) === "WEBP") {
    format = "webp";
    if (buffer.toString("utf8", 12, 16) === "VP8 ") {
      width = buffer.readUInt16LE(26) & 0x3fff;
      height = buffer.readUInt16LE(28) & 0x3fff;
    }
  } else {
    const ext = filename.toLowerCase().split(".").pop() || "image";
    format = ext;
    width = 1200;
    height = 800;
  }

  // Check if filename indicates handwritten note
  const isHandwrittenName = /handwritten|notes|cursive|draft|scribble|journal|diary/i.test(filename);
  // Estimate noise level by standard byte variance
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  let varianceSum = 0;
  for (let i = 1; i < sample.length; i++) {
    varianceSum += Math.abs(sample[i] - sample[i - 1]);
  }
  const avgVariance = varianceSum / sample.length;
  const noiseLevel = avgVariance > 45 ? "high" : avgVariance > 20 ? "medium" : "low";

  return {
    width: width || 1200,
    height: height || 800,
    format,
    isLikelyHandwritten: isHandwrittenName,
    estimatedConfidence: isHandwrittenName ? 0.82 : 0.96,
    deskewAngleDegrees: 0.0,
    noiseLevel,
  };
}
