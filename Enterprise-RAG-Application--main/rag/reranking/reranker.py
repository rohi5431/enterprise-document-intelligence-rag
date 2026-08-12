from sentence_transformers import CrossEncoder


class Reranker:

    def __init__(self):
        self.model = CrossEncoder(
            "BAAI/bge-reranker-base"
        )

    def rerank(self, query, results):

        if not results:
            return results

        pairs = [
            (query, chunk.text)
            for chunk in results
        ]

        scores = self.model.predict(pairs)

        for chunk, score in zip(results, scores):
            chunk.rerank_score = float(score)

        results.sort(
            key=lambda x: x.rerank_score,
            reverse=True
        )

        return results