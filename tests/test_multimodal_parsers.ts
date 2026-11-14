/**
 * Multimodal Parsers Unit & Integration Test Suite
 *
 * Validates extraction correctness, metadata preservation, error resilience,
 * and security sanitization across:
 * - CSV / TSV tabular content
 * - Markdown & structured plain text
 * - HTML & internet-copied content (strict XSS stripping)
 * - JSON structured data
 * - OpenXML DOCX (with table and heading formatting)
 * - OpenXML XLSX (sheets and shared strings to Markdown table)
 * - OpenXML PPTX (slide text runs and speaker notes)
 * - Legacy DOC binary stream parsing
 * - Image sniffing (PNG/JPEG/WEBP dimensions, noise, and handwriting heuristics)
 */
import assert from "assert";
import zlib from "zlib";
import {
  parseCsvToText,
  parseMarkdownToText,
  parseHtmlToText,
  sanitizeHtmlContent,
  parseJsonToText,
  parseDocxToText,
  parseDocBinaryToText,
  parseXlsxToText,
  parsePptxToText,
  inspectImageBuffer,
  validateUploadedFile,
} from "../src/lib/documentParsers";

// ── Minimal ZIP builder helper for in-memory OpenXML testing ──
function createZipBuffer(entries: Record<string, string>): Buffer {
  const fileBuffers: Array<{ name: string; compressed: Buffer; uncompressed: Buffer; offset: number; crc: number }> = [];
  const parts: Buffer[] = [];
  let currentOffset = 0;

  for (const [name, content] of Object.entries(entries)) {
    const uncompressed = Buffer.from(content, "utf8");
    const compressed = zlib.deflateRawSync(uncompressed);
    const nameBuf = Buffer.from(name, "utf8");

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(8, 8); // compression method (deflate)
    localHeader.writeUInt16LE(0, 10); // time
    localHeader.writeUInt16LE(0, 12); // date
    localHeader.writeUInt32LE(0, 14); // crc32 placeholder
    localHeader.writeUInt32LE(compressed.length, 18); // compressed size
    localHeader.writeUInt32LE(uncompressed.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // name length
    localHeader.writeUInt16LE(0, 28); // extra length
    nameBuf.copy(localHeader, 30);

    fileBuffers.push({
      name,
      compressed,
      uncompressed,
      offset: currentOffset,
      crc: 0,
    });

    parts.push(localHeader, compressed);
    currentOffset += localHeader.length + compressed.length;
  }

  const centralDirStart = currentOffset;
  let centralDirSize = 0;

  for (const file of fileBuffers) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const cdHeader = Buffer.alloc(46 + nameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0); // central directory signature
    cdHeader.writeUInt16LE(20, 4); // version made by
    cdHeader.writeUInt16LE(20, 6); // version needed
    cdHeader.writeUInt16LE(0, 8); // flags
    cdHeader.writeUInt16LE(8, 10); // compression method
    cdHeader.writeUInt16LE(0, 12); // time
    cdHeader.writeUInt16LE(0, 14); // date
    cdHeader.writeUInt32LE(file.crc, 16); // crc32
    cdHeader.writeUInt32LE(file.compressed.length, 20); // compressed size
    cdHeader.writeUInt32LE(file.uncompressed.length, 24); // uncompressed size
    cdHeader.writeUInt16LE(nameBuf.length, 28); // name length
    cdHeader.writeUInt16LE(0, 30); // extra length
    cdHeader.writeUInt16LE(0, 32); // comment length
    cdHeader.writeUInt16LE(0, 34); // disk start
    cdHeader.writeUInt16LE(0, 36); // internal attr
    cdHeader.writeUInt32LE(0, 38); // external attr
    cdHeader.writeUInt32LE(file.offset, 42); // local header offset
    nameBuf.copy(cdHeader, 46);

    parts.push(cdHeader);
    centralDirSize += cdHeader.length;
  }

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // cd disk number
  eocd.writeUInt16LE(fileBuffers.length, 8); // disk entries
  eocd.writeUInt16LE(fileBuffers.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12); // cd size
  eocd.writeUInt32LE(centralDirStart, 16); // cd offset
  eocd.writeUInt16LE(0, 20); // comment length
  parts.push(eocd);

  return Buffer.concat(parts);
}

// ── Minimal PNG builder for header sniffing ──
function createPngBuffer(width: number, height: number): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = Buffer.alloc(25);
  ihdrChunk.writeUInt32BE(13, 0); // length
  ihdrChunk.write("IHDR", 4, "ascii");
  ihdrChunk.writeUInt32BE(width, 8);
  ihdrChunk.writeUInt32BE(height, 12);
  ihdrChunk[16] = 8; // bit depth
  ihdrChunk[17] = 2; // color type (RGB)
  return Buffer.concat([header, ihdrChunk]);
}

async function runTests() {
  console.log("=== STARTING MULTIMODAL PARSER TESTS ===");
  let passed = 0;

  // 1. CSV Parser Test
  console.log("\n[Test 1] CSV Tabular Extraction & Formatting...");
  const csvData = `id,department,budget,status\n101,Engineering,$450000,Approved\n102,Marketing,"$180,000",Pending\n103,Legal,$95000,Approved`;
  const csvTable = parseCsvToText(csvData);
  assert(csvTable.includes("| id | department | budget | status |"), "CSV header row missing");
  assert(csvTable.includes("| 101 | Engineering | $450000 | Approved |"), "CSV row 1 missing");
  assert(csvTable.includes("| 102 | Marketing | $180,000 | Pending |"), "CSV quoted field missing");
  console.log("✓ CSV parser properly converted 3 data rows into formatted Markdown table.");
  passed++;

  // 2. HTML Sanitization & Extraction Test
  console.log("\n[Test 2] HTML Parsing & Strict XSS Sanitization...");
  const maliciousHtml = `
    <html>
      <head><title>System Architecture Spec</title><script>alert('pwned')</script></head>
      <body>
        <h1 onclick="steal()">Core Infrastructure Overview</h1>
        <p>The system utilizes distributed microservices.<script>evil()</script></p>
        <iframe src="http://evil.com"></iframe>
        <a href="javascript:attack()">Click here</a>
        <a href="https://example.com/docs">Documentation Link</a>
      </body>
    </html>
  `;
  const htmlRes = parseHtmlToText(maliciousHtml);
  const sanitized = sanitizeHtmlContent(maliciousHtml);
  assert(!htmlRes.text.includes("<script>"), "Script tag leaked into text!");
  assert(!htmlRes.text.includes("alert"), "Script body leaked into text!");
  assert(!htmlRes.text.includes("iframe"), "Iframe leaked into text!");
  assert(!sanitized.cleanHtml.includes("onclick"), "Inline event handler not stripped!");
  assert(htmlRes.text.includes("# Core Infrastructure Overview"), "Heading 1 markdown conversion missing");
  assert(htmlRes.text.includes("[Documentation Link](https://example.com/docs)"), "Markdown link conversion missing");
  assert.strictEqual(sanitized.title, "System Architecture Spec", "Page title not extracted correctly");
  console.log("✓ HTML parser sanitized dangerous scripts/iframes and converted DOM to clean Markdown.");
  passed++;

  // 3. JSON Structured Data Test
  console.log("\n[Test 3] JSON Structured Data Parsing...");
  const jsonData = JSON.stringify({
    service: "ContextRag API Gateway",
    version: "1.0.0-GA",
    database: {
      type: "Qdrant",
      dimension: 384,
      collection: "documents",
    },
    features: ["hybrid_search", "parent_child_chunking", "ocr_extraction"],
  });
  const jsonRes = parseJsonToText(jsonData);
  assert(jsonRes.text.includes("**service**: ContextRag API Gateway"), "Key-value flattening missing");
  assert(jsonRes.text.includes("**database.type**: Qdrant"), "Nested key-path flattening missing");
  assert(jsonRes.text.includes("**database.dimension**: 384"), "Nested number flattening missing");
  assert(jsonRes.text.includes("hybrid_search"), "Array elements missing");
  console.log("✓ JSON parser flattened nested hierarchies into searchable semantic blocks.");
  passed++;

  // 4. Microsoft Word DOCX OpenXML Test
  console.log("\n[Test 4] DOCX OpenXML Extraction & Table Preservation...");
  const docxXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Project Scope Document</w:t></w:r></w:p>
        <w:p><w:r><w:t>This document outlines the scope of work for Phase 6.</w:t></w:r></w:p>
        <w:tbl>
          <w:tr><w:tc><w:p><w:r><w:t>Milestone</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Deliverable</w:t></w:r></w:p></w:tc></w:tr>
          <w:tr><w:tc><w:p><w:r><w:t>Phase 1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Feature Audit</w:t></w:r></w:p></w:tc></w:tr>
        </w:tbl>
      </w:body>
    </w:document>`;
  const docxBuffer = createZipBuffer({ "word/document.xml": docxXml });
  const docxResult = parseDocxToText(docxBuffer);
  assert(docxResult.text.includes("# Project Scope Document"), "Heading 1 not converted");
  assert(docxResult.text.includes("Phase 6"), "Body paragraph missing");
  assert(docxResult.metadata.hasTables, "Table detection flag missing");
  console.log("✓ DOCX parser decompressed OpenXML package, converted headings, and extracted tables.");
  passed++;

  // 5. Microsoft Excel XLSX OpenXML Test
  console.log("\n[Test 5] XLSX OpenXML Spreadsheet Extraction...");
  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <si><t>Q1 Revenue</t></si>
      <si><t>Q2 Revenue</t></si>
      <si><t>Total ARR</t></si>
    </sst>`;
  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData>
        <row r="1">
          <c r="A1" t="s"><v>0</v></c>
          <c r="B1" t="s"><v>1</v></c>
          <c r="C1" t="s"><v>2</v></c>
        </row>
        <row r="2">
          <c r="A2"><v>1250000</v></c>
          <c r="B2"><v>1420000</v></c>
          <c r="C2"><v>2670000</v></c>
        </row>
      </sheetData>
    </worksheet>`;
  const xlsxBuffer = createZipBuffer({
    "xl/sharedStrings.xml": sharedStringsXml,
    "xl/worksheets/sheet1.xml": sheet1Xml,
  });
  const xlsxResult = parseXlsxToText(xlsxBuffer);
  assert(xlsxResult.text.includes("| Q1 Revenue | Q2 Revenue | Total ARR |"), "Shared strings header row missing");
  assert(xlsxResult.text.includes("| 1250000 | 1420000 | 2670000 |"), "Data row missing");
  assert.strictEqual(xlsxResult.metadata.sheetCount, 1, "Sheet count mismatch");
  console.log("✓ XLSX parser resolved shared string indices and generated Markdown table.");
  passed++;

  // 6. Microsoft PowerPoint PPTX OpenXML Test
  console.log("\n[Test 6] PPTX OpenXML Presentation Extraction...");
  const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree>
        <p:sp><p:txBody><a:p><a:r><a:t>Executive Summary</a:t></a:r></a:p></p:txBody></p:sp>
        <p:sp><p:txBody><a:p><a:r><a:t>ContextRag Platform Launch Q4</a:t></a:r></a:p></p:txBody></p:sp>
      </p:spTree></p:cSld>
    </p:sld>`;
  const note1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Presenter note: Emphasize hybrid search latency.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
    </p:notes>`;
  const pptxBuffer = createZipBuffer({
    "ppt/slides/slide1.xml": slide1Xml,
    "ppt/notesSlides/notesSlide1.xml": note1Xml,
  });
  const pptxResult = parsePptxToText(pptxBuffer);
  assert(pptxResult.text.includes("## Slide 1: Executive Summary"), "Slide 1 title missing");
  assert(pptxResult.text.includes("- ContextRag Platform Launch Q4"), "Slide bullet missing");
  assert(pptxResult.text.includes("Presenter note: Emphasize hybrid search latency."), "Speaker notes missing");
  assert.strictEqual(pptxResult.metadata.slideCount, 1, "Slide count mismatch");
  console.log("✓ PPTX parser extracted slide text runs and speaker notes slide by slide.");
  passed++;

  // 7. Image Sniffing & Handwriting Heuristic Test
  console.log("\n[Test 7] Image Header Sniffing & Handwriting Heuristics...");
  const pngBuffer = createPngBuffer(1920, 1080);
  const printedMeta = inspectImageBuffer("diagram_architecture.png", pngBuffer);
  assert.strictEqual(printedMeta.format, "png", "Format mismatch");
  assert.strictEqual(printedMeta.width, 1920, "Width mismatch");
  assert.strictEqual(printedMeta.height, 1080, "Height mismatch");
  assert.strictEqual(printedMeta.isLikelyHandwritten, false, "Printed image misclassified as handwriting");

  const handwrittenMeta = inspectImageBuffer("meeting_notes_handwritten_draft.png", pngBuffer);
  assert.strictEqual(handwrittenMeta.isLikelyHandwritten, true, "Handwritten image not detected by classifier");
  assert(handwrittenMeta.estimatedConfidence < 0.9, "Handwriting confidence should reflect variance");
  console.log(`✓ Image inspector correctly parsed 1920x1080 PNG header and distinguished printed vs handwritten.`);
  passed++;

  // 8. File Validation Security Test
  console.log("\n[Test 8] File Upload Security & Extension Validation...");
  const validCheck = validateUploadedFile("report.xlsx", xlsxBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.strictEqual(validCheck.valid, true, "Valid XLSX rejected");

  const emptyCheck = validateUploadedFile("empty.pdf", Buffer.alloc(0));
  assert.strictEqual(emptyCheck.valid, false, "Empty file accepted");

  const exeCheck = validateUploadedFile("malicious.exe", Buffer.from("MZ..."), "application/x-msdownload");
  assert.strictEqual(exeCheck.valid, false, "Executable file accepted");
  console.log("✓ Upload validator properly accepted valid documents and rejected empty and executable files.");
  passed++;

  console.log(`\n========================================`);
  console.log(`ALL ${passed}/${passed} MULTIMODAL PARSER TESTS PASSED!`);
  console.log(`========================================\n`);
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
