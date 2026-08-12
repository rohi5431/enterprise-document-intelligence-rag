"""
Unit Tests — validates information retrieval metrics calculation
"""
from __future__ import annotations

from evaluation.metrics.retrieval_metrics import hit_rate, precision_at_k, recall_at_k, mrr, ndcg_at_k


def test_hit_rate():
    assert hit_rate([1, 2, 3], {2}) == 1.0
    assert hit_rate([1, 2, 3], {4}) == 0.0
    assert hit_rate([], {1}) == 0.0
    assert hit_rate([1], set()) == 0.0


def test_precision_at_k():
    assert precision_at_k([1, 2, 3, 4], {2, 4}, k=3) == 1.0 / 3.0
    assert precision_at_k([1, 2, 3, 4], {2, 4}, k=4) == 2.0 / 4.0
    assert precision_at_k([1, 2], {3}, k=2) == 0.0
    assert precision_at_k([], {1}, k=5) == 0.0


def test_recall_at_k():
    assert recall_at_k([1, 2, 3, 4], {2, 4}, k=3) == 0.5
    assert recall_at_k([1, 2, 3, 4], {2, 4}, k=4) == 1.0
    assert recall_at_k([1], {2, 3}, k=1) == 0.0


def test_mrr():
    assert mrr([1, 2, 3], {2}) == 0.5
    assert mrr([1, 2, 3], {1}) == 1.0
    assert mrr([1, 2, 3], {4}) == 0.0
    assert mrr([], {1}) == 0.0


def test_ndcg_at_k():
    # perfect matching
    assert ndcg_at_k([1, 2], {1, 2}, k=2) == 1.0
    # correct matches but in worse order
    val1 = ndcg_at_k([2, 1], {1}, k=2)
    val2 = ndcg_at_k([1, 2], {1}, k=2)
    assert val1 < val2
    # empty test
    assert ndcg_at_k([], {1}, k=2) == 0.0
