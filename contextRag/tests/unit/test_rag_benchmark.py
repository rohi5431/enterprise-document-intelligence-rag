"""
Tests for Phase 4: RAG Evaluation Benchmark Suite
=================================================
Validates:
  - Dataset schema, consistency, and category coverage
  - Deterministic retrieval metric functions (Precision, Recall, MRR, NDCG, Hit Rate)
  - Edge cases: empty retrieval, missing relevant docs, unanswerable queries
  - Citation precision and recall calculations
  - Generation metric error handling (no fabricated 0.5 scores)
  - Benchmark result serialization and summary structure
"""
from __future__ import annotations

import os

# Set test environment before app/config imports
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("SECRET_KEY", "phase4-test-only-secret-not-for-deployments-32-chars")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("REFRESH_TOKEN_EXPIRE_DAYS", "7")

import json
import tempfile
from pathlib import Path
import pytest

from evaluation.metrics.retrieval_metrics import (
    average_precision,
    hit_rate,
    mrr,
    ndcg_at_k,
    precision_at_k,
    recall_at_k,
)
from evaluation.metrics.generation_metrics import (
    GenerationEvaluationError,
    GenerationEvaluator,
)
from evaluation.run_rag_benchmark import (
    RAGBenchmarkRunner,
    calculate_citation_metrics,
    compute_lexical_overlap_score,
    evaluate_unanswerable_refusal,
)


# ---------------------------------------------------------------------------
# 1. Dataset Integrity & Ground Truth Tests
# ---------------------------------------------------------------------------

def test_ground_truth_dataset_loading_and_schema():
    """Verify ground truth dataset loads, has valid schema, and non-empty questions."""
    dataset_path = Path("evaluation/datasets/rag_ground_truth.json")
    assert dataset_path.exists(), f"Dataset file not found at {dataset_path}"

    runner = RAGBenchmarkRunner(dataset_path=str(dataset_path))
    report = runner.validate_dataset_integrity()

    assert report["is_valid"] is True
    assert report["total_questions"] >= 20
    assert report["schema_errors"] == []
    assert report["answerable_count"] > 0
    assert report["unanswerable_count"] > 0


def test_ground_truth_category_distribution():
    """Verify ground truth covers all 7 required Phase 4 categories."""
    runner = RAGBenchmarkRunner()
    report = runner.validate_dataset_integrity()
    categories = set(report["category_distribution"].keys())

    expected_categories = {
        "Direct factual",
        "Multi-passage reasoning",
        "Cross-document",
        "Unanswerable",
        "Ambiguous",
        "Exact technical details",
        "Multiple citations",
    }
    assert expected_categories.issubset(categories), f"Missing categories: {expected_categories - categories}"


def test_ground_truth_corpus_documents_exist():
    """Verify every document referenced by ground truth questions exists on disk."""
    dataset_path = Path("evaluation/datasets/rag_ground_truth.json")
    with open(dataset_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    for doc in data.get("corpus_documents", []):
        file_path = Path(doc["path"])
        assert file_path.exists(), f"Corpus doc {file_path} does not exist"
        assert file_path.stat().st_size > 100, f"Corpus doc {file_path} is unexpectedly small/empty"


# ---------------------------------------------------------------------------
# 2. Retrieval Metric Boundary & Calculation Tests
# ---------------------------------------------------------------------------

def test_retrieval_metrics_exact_match():
    """When retrieved list matches ground truth exactly in top positions."""
    retrieved = [1, 2, 3, 4, 5]
    ground_truth = {1, 2}

    assert hit_rate(retrieved, ground_truth) == 1.0
    assert precision_at_k(retrieved, ground_truth, k=2) == 1.0
    assert precision_at_k(retrieved, ground_truth, k=5) == 2 / 5
    assert recall_at_k(retrieved, ground_truth, k=2) == 1.0
    assert mrr(retrieved, ground_truth) == 1.0
    assert ndcg_at_k(retrieved, ground_truth, k=5) == 1.0


def test_retrieval_metrics_empty_retrieved():
    """Empty retrieved list must produce 0.0 across all metrics without error."""
    retrieved = []
    ground_truth = {1, 2}

    assert hit_rate(retrieved, ground_truth) == 0.0
    assert precision_at_k(retrieved, ground_truth, k=5) == 0.0
    assert recall_at_k(retrieved, ground_truth, k=5) == 0.0
    assert mrr(retrieved, ground_truth) == 0.0
    assert ndcg_at_k(retrieved, ground_truth, k=5) == 0.0
    assert average_precision(retrieved, ground_truth) == 0.0


def test_retrieval_metrics_empty_ground_truth():
    """Empty ground truth (unanswerable / out of domain) returns 0.0 without divide-by-zero."""
    retrieved = [1, 2, 3]
    ground_truth = set()

    assert hit_rate(retrieved, ground_truth) == 0.0
    assert precision_at_k(retrieved, ground_truth, k=3) == 0.0
    assert recall_at_k(retrieved, ground_truth, k=3) == 0.0
    assert mrr(retrieved, ground_truth) == 0.0
    assert ndcg_at_k(retrieved, ground_truth, k=3) == 0.0
    assert average_precision(retrieved, ground_truth) == 0.0


def test_retrieval_metrics_mrr_ranking_decay():
    """MRR must decay appropriately based on rank position of first hit."""
    gt = {42}
    assert mrr([42, 1, 2], gt) == 1.0
    assert mrr([1, 42, 2], gt) == 0.5
    assert mrr([1, 2, 42], gt) == 1 / 3
    assert mrr([1, 2, 3], gt) == 0.0


# ---------------------------------------------------------------------------
# 3. Citation Metric & Unanswerable Evaluation Tests
# ---------------------------------------------------------------------------

def test_citation_metrics_perfect_precision_and_recall():
    """Citations that match relevant docs exactly achieve 1.0 precision and recall."""
    res = calculate_citation_metrics(cited_docs=[1, 2], relevant_docs={1, 2})
    assert res["citation_precision"] == 1.0
    assert res["citation_recall"] == 1.0


def test_citation_metrics_partial_and_hallucinated():
    """Handles partial citations and hallucinated citations correctly."""
    # Cited [1, 99], relevant is {1, 2}
    res = calculate_citation_metrics(cited_docs=[1, 99], relevant_docs={1, 2})
    assert res["citation_precision"] == 0.5  # 1 out of 2 cited is relevant
    assert res["citation_recall"] == 0.5     # 1 out of 2 relevant was cited


def test_citation_metrics_empty_citations():
    """Empty citations handled without error."""
    res = calculate_citation_metrics(cited_docs=[], relevant_docs={1})
    assert res["citation_precision"] == 0.0
    assert res["citation_recall"] == 0.0

    res_no_gt = calculate_citation_metrics(cited_docs=[], relevant_docs=set())
    assert res_no_gt["citation_precision"] == 1.0
    assert res_no_gt["citation_recall"] == 1.0


def test_unanswerable_refusal_detection():
    """System correctly flags honest refusal vs hallucination for unanswerable queries."""
    # Good refusal: acknowledges information is not found
    good_refusal = evaluate_unanswerable_refusal(
        query_answerable=False,
        answer_text="The provided documentation does not contain information on this topic.",
    )
    assert good_refusal["is_unanswerable"] is True
    assert good_refusal["correctly_refused"] is True
    assert good_refusal["hallucination_detected"] is False

    # Hallucination: claims to answer an unanswerable question
    hallucinated = evaluate_unanswerable_refusal(
        query_answerable=False,
        answer_text="The system requires 16 GB of dedicated GPU VRAM and a Tesla T4.",
    )
    assert hallucinated["correctly_refused"] is False
    assert hallucinated["hallucination_detected"] is True


def test_lexical_overlap_score():
    """Lexical F1 calculation is bounded between 0.0 and 1.0."""
    score_exact = compute_lexical_overlap_score("FastAPI backend port 8000", "FastAPI backend port 8000")
    assert score_exact == 1.0

    score_partial = compute_lexical_overlap_score("FastAPI runs on port 8000", "port 8000 is used")
    assert 0.0 < score_partial < 1.0

    score_none = compute_lexical_overlap_score("apple banana", "car truck")
    assert score_none == 0.0


# ---------------------------------------------------------------------------
# 4. Generation Metric Error Handling (No Fake 0.5 Scores)
# ---------------------------------------------------------------------------

class BrokenLLMClient:
    """Mock LLM client that always raises an exception."""
    def generate(self, prompt: str) -> str:
        raise ConnectionError("Ollama service unavailable: connection refused")


def test_generation_evaluator_strict_mode_raises():
    """In strict mode (raise_on_error=True), evaluator raises GenerationEvaluationError instead of faking 0.5."""
    evaluator = GenerationEvaluator(llm=BrokenLLMClient())

    with pytest.raises(GenerationEvaluationError, match="Faithfulness evaluation failed"):
        evaluator.faithfulness("answer", "context", raise_on_error=True)

    with pytest.raises(GenerationEvaluationError, match="Context relevance evaluation failed"):
        evaluator.context_relevance("query", "context", raise_on_error=True)

    with pytest.raises(GenerationEvaluationError, match="Answer relevance evaluation failed"):
        evaluator.answer_relevance("query", "answer", raise_on_error=True)

    with pytest.raises(GenerationEvaluationError, match="Answer correctness evaluation failed"):
        evaluator.answer_correctness("query", "answer", "ground_truth", raise_on_error=True)


def test_generation_evaluator_non_strict_returns_zero_not_half():
    """In default non-strict mode, evaluator returns 0.0 (failure), NEVER a synthetic 0.5."""
    evaluator = GenerationEvaluator(llm=BrokenLLMClient())

    score_faith = evaluator.faithfulness("answer", "context", raise_on_error=False)
    assert score_faith == 0.0, f"Expected 0.0 on error, got {score_faith}"

    score_cr = evaluator.context_relevance("query", "context", raise_on_error=False)
    assert score_cr == 0.0, f"Expected 0.0 on error, got {score_cr}"

    score_ar = evaluator.answer_relevance("query", "answer", raise_on_error=False)
    assert score_ar == 0.0, f"Expected 0.0 on error, got {score_ar}"

    score_ac = evaluator.answer_correctness("query", "answer", "gt", raise_on_error=False)
    assert score_ac == 0.0, f"Expected 0.0 on error, got {score_ac}"


# ---------------------------------------------------------------------------
# 5. Benchmark Result Serialization & Directory Isolation
# ---------------------------------------------------------------------------

def test_offline_validation_serialization(tmp_path):
    """Benchmark runner writes structured JSON results to dedicated run directory."""
    runner = RAGBenchmarkRunner(results_dir=str(tmp_path))
    summary = runner.run_offline_validation(k_values=(3, 5))

    run_dirs = list(tmp_path.iterdir())
    assert len(run_dirs) == 1
    run_dir = run_dirs[0]

    expected_files = [
        "retrieval_results.json",
        "answer_quality_results.json",
        "citation_results.json",
        "benchmark_summary.json",
    ]
    for filename in expected_files:
        p = run_dir / filename
        assert p.exists(), f"Expected file {filename} not generated"
        content = json.loads(p.read_text(encoding="utf-8"))
        assert len(content) > 0, f"File {filename} is empty"

    assert summary["execution_status"] == "PASSED"
    assert summary["total_questions_evaluated"] >= 20
