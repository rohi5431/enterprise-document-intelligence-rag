from evaluation.metrics.retrieval_metrics import (
    precision_at_k,
    recall_at_k,
    mrr,
    ndcg_at_k,
    hit_rate,
    average_precision
)

from evaluation.metrics.generation_metrics import (
    GenerationEvaluator
)


class RAGEvaluator:

    def __init__(self):

        self.generator_eval = (
            GenerationEvaluator()
        )

    def evaluate(
        self,
        query,
        answer,
        context,
        retrieved_ids,
        ground_truth_ids,
        ground_truth_answer
    ):

        retrieval_scores = {

            "hit_rate":
                hit_rate(
                    retrieved_ids,
                    ground_truth_ids
                ),

            "precision@5":
                precision_at_k(
                    retrieved_ids,
                    ground_truth_ids,
                    5
                ),

            "recall@5":
                recall_at_k(
                    retrieved_ids,
                    ground_truth_ids,
                    5
                ),

            "mrr":
                mrr(
                    retrieved_ids,
                    ground_truth_ids
                ),

            "ndcg@5":
                ndcg_at_k(
                    retrieved_ids,
                    ground_truth_ids,
                    5
                ),

            "average_precision":
                average_precision(
                    retrieved_ids,
                    ground_truth_ids
                )
        }

        generation_scores = {

            "faithfulness":
                self.generator_eval.faithfulness(
                    answer,
                    context
                ),

            "context_relevance":
                self.generator_eval.context_relevance(
                    query,
                    context
                ),

            "answer_relevance":
                self.generator_eval.answer_relevance(
                    query,
                    answer
                ),

            "answer_correctness":
                self.generator_eval.answer_correctness(
                    query,
                    answer,
                    ground_truth_answer
                )
        }

        return {
            "retrieval": retrieval_scores,
            "generation": generation_scores
        }