"""
Retrieval Metrics — functions for evaluation of retrieved document relevance
"""
from __future__ import annotations

import math
from typing import List, Set


def hit_rate(retrieved_ids: List[int], ground_truth_ids: Set[int]) -> float:
    """1.0 if at least one ground truth ID is in retrieved_ids, else 0.0."""
    if not ground_truth_ids:
        return 0.0
    for rid in retrieved_ids:
        if rid in ground_truth_ids:
            return 1.0
    return 0.0


def precision_at_k(retrieved_ids: List[int], ground_truth_ids: Set[int], k: int) -> float:
    """Number of relevant documents in top-K divided by K."""
    if k <= 0 or not ground_truth_ids:
        return 0.0
    top_k_retrieved = retrieved_ids[:k]
    relevant_retrieved = sum(1 for rid in top_k_retrieved if rid in ground_truth_ids)
    return relevant_retrieved / k


def recall_at_k(retrieved_ids: List[int], ground_truth_ids: Set[int], k: int) -> float:
    """Number of relevant documents in top-K divided by total number of relevant documents."""
    if not ground_truth_ids or k <= 0:
        return 0.0
    top_k_retrieved = retrieved_ids[:k]
    relevant_retrieved = sum(1 for rid in top_k_retrieved if rid in ground_truth_ids)
    return relevant_retrieved / len(ground_truth_ids)


def mrr(retrieved_ids: List[int], ground_truth_ids: Set[int]) -> float:
    """Mean Reciprocal Rank: reciprocal rank of the first relevant document retrieved."""
    if not ground_truth_ids:
        return 0.0
    for idx, rid in enumerate(retrieved_ids):
        if rid in ground_truth_ids:
            return 1.0 / (idx + 1)
    return 0.0


def ndcg_at_k(retrieved_ids: List[int], ground_truth_ids: Set[int], k: int) -> float:
    """Normalized Discounted Cumulative Gain at K (assuming binary relevance)."""
    if not ground_truth_ids or k <= 0:
        return 0.0
    
    top_k_retrieved = retrieved_ids[:k]
    
    # Calculate DCG@K
    dcg = 0.0
    for idx, rid in enumerate(top_k_retrieved):
        if rid in ground_truth_ids:
            # relevance is 1
            dcg += 1.0 / math.log2(idx + 2)
            
    # Calculate IDCG@K (Ideal DCG: sorted ideal retrieval of all relevant docs)
    idcg = 0.0
    ideal_relevant_count = min(len(ground_truth_ids), k)
    for idx in range(ideal_relevant_count):
        idcg += 1.0 / math.log2(idx + 2)
        
    if idcg == 0.0:
        return 0.0
        
    return dcg / idcg


def average_precision(
    retrieved_ids,
    ground_truth_ids
):
    if not ground_truth_ids:
        return 0.0

    score = 0.0
    hits = 0

    for idx, doc_id in enumerate(retrieved_ids):

        if doc_id in ground_truth_ids:

            hits += 1

            score += hits / (idx + 1)

    return score / len(ground_truth_ids)