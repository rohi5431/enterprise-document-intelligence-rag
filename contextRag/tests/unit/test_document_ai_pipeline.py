import unittest
import numpy as np
import cv2

from app.document_ai.vision.preprocessing import (
    load_image, convert_to_grayscale, resize_image,
    denoise_image, enhance_contrast, threshold_image
)
from app.document_ai.vision.deskew import compute_skew_angle, rotate_image, deskew_document
from app.document_ai.ocr.ocr_schema import OCRItem, PageOCRResult
from app.document_ai.ocr.paddle_ocr import PaddleOCREngine
from app.document_ai.layout.layout_schema import LayoutBlock, PageLayoutResult
from app.document_ai.layout.layout_parser import LayoutAnalyzer
from app.document_ai.chunking.layout_chunker import LayoutAwareChunker


class TestDocumentAIPipeline(unittest.TestCase):

    def setUp(self):
        # Create a synthetic document image (800x600 white canvas with black text line)
        self.dummy_img = np.full((600, 800, 3), 255, dtype=np.uint8)
        # Draw text simulation bar
        cv2.rectangle(self.dummy_img, (100, 100), (500, 140), (0, 0, 0), -1)

    # ----------------------------------------------------
    # PHASE 1 TESTS: OpenCV Preprocessing
    # ----------------------------------------------------
    def test_opencv_preprocessing(self):
        gray = convert_to_grayscale(self.dummy_img)
        self.assertEqual(len(gray.shape), 2)
        self.assertEqual(gray.shape[:2], (600, 800))

        resized = resize_image(self.dummy_img, max_dim=400)
        self.assertLessEqual(max(resized.shape[:2]), 400)

        denoised = denoise_image(gray)
        self.assertEqual(denoised.shape, gray.shape)

        enhanced = enhance_contrast(gray)
        self.assertEqual(enhanced.shape, gray.shape)

        thresh = threshold_image(gray)
        self.assertTrue(np.array_equal(np.unique(thresh), np.array([0, 255])) or len(np.unique(thresh)) <= 2)

    def test_deskew(self):
        angle = compute_skew_angle(self.dummy_img)
        self.assertIsInstance(angle, float)
        corrected, detected_angle = deskew_document(self.dummy_img)
        self.assertEqual(len(corrected.shape), 3)

    # ----------------------------------------------------
    # PHASE 2 TESTS: OCR Engine & Normalized Schema
    # ----------------------------------------------------
    def test_ocr_schema(self):
        ocr_item = OCRItem(
            text="Invoice #10023",
            bbox=[100, 120, 140, 500],
            confidence=0.98,
            page=1,
            source="invoice.pdf"
        )
        page_res = PageOCRResult(
            page=1,
            items=[ocr_item],
            full_text="Invoice #10023",
            average_confidence=0.98
        )
        self.assertEqual(page_res.items[0].text, "Invoice #10023")
        self.assertEqual(page_res.average_confidence, 0.98)

    def test_paddle_ocr_engine_execution(self):
        engine = PaddleOCREngine()
        gray = convert_to_grayscale(self.dummy_img)
        res = engine.process_image(gray, page_num=1, source_id="test_doc.png")
        self.assertIsInstance(res, PageOCRResult)
        self.assertEqual(res.page, 1)

    # ----------------------------------------------------
    # PHASE 3 TESTS: Layout Analysis & Bounding Box Linking
    # ----------------------------------------------------
    def test_layout_analyzer(self):
        items = [
            OCRItem(text="ANNUAL REPORT 2026", bbox=[20, 100, 60, 500], confidence=0.99, page=1),
            OCRItem(text="Financial Summary", bbox=[80, 100, 110, 400], confidence=0.97, page=1),
            OCRItem(text="Total Revenue was $12.5 Million in fiscal year 2026.", bbox=[180, 100, 220, 700], confidence=0.95, page=1),
        ]
        page_ocr = PageOCRResult(page=1, items=items, full_text="ANNUAL REPORT 2026 Financial Summary...", average_confidence=0.97)

        analyzer = LayoutAnalyzer()
        layout_res = analyzer.analyze_page(page_ocr)

        self.assertGreater(len(layout_res.blocks), 0)
        self.assertIn("paragraph", [b.block_type for b in layout_res.blocks] + ["title", "header"])

    # ----------------------------------------------------
    # PHASE 4 TESTS: Layout-Aware Chunking & Metadata Preservation
    # ----------------------------------------------------
    def test_layout_aware_chunking(self):
        blocks = [
            LayoutBlock(
                block_id="b1", page=1, block_type="title",
                bbox=[20, 100, 60, 500], text="Executive Summary", confidence=0.99
            ),
            LayoutBlock(
                block_id="b2", page=1, block_type="paragraph",
                bbox=[100, 100, 200, 700],
                text="The company experienced 45% YoY growth across all cloud segments.",
                confidence=0.96
            )
        ]
        page_layout = PageLayoutResult(page=1, blocks=blocks)

        chunker = LayoutAwareChunker(max_chunk_size=200)
        chunks = chunker.chunk_layout_results(
            layout_results=[page_layout],
            doc_id="doc_test_123",
            source_name="annual_report.pdf",
            ocr_used=True
        )

        self.assertEqual(len(chunks), 2)
        self.assertEqual(chunks[0]["document_id"], "doc_test_123")
        self.assertEqual(chunks[0]["source"], "annual_report.pdf")
        self.assertEqual(chunks[0]["ocr_confidence"], 0.99)
        self.assertTrue(chunks[0]["ocr_used"])
        self.assertIn("bbox", chunks[0])
        self.assertIn("block_type", chunks[0])


if __name__ == "__main__":
    unittest.main()
