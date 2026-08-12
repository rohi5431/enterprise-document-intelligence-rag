from rag.evaluation.retrieval_evaluator import RetrievalEvaluator

retrieved = [3, 5, 1, 7, 9]

relevant = [3, 1]

print()

print("Precision@5 =",
      RetrievalEvaluator.precision_at_k(
          retrieved,
          relevant,
          5
      ))

print("Recall@5 =",
      RetrievalEvaluator.recall_at_k(
          retrieved,
          relevant,
          5
      ))

print("HitRate =",
      RetrievalEvaluator.hit_rate(
          retrieved,
          relevant,
          5
      ))

print("MRR =",
      RetrievalEvaluator.mrr(
          retrieved,
          relevant
      ))