"""
Generation Metrics — LLM-based evaluation of RAG responses using Ollama
"""

from __future__ import annotations

import json
import logging
import re
from typing import Optional

from rag.llm.ollama_client import OllamaClient

logger = logging.getLogger(__name__)


class GenerationEvaluationError(RuntimeError):
    """Raised when an LLM evaluation metric computation fails without fallback."""
    pass


class GenerationEvaluator:
    """
    Uses Ollama or mock LLM to evaluate RAG generation quality metrics.
    """

    def __init__(self, llm: Optional[OllamaClient] = None) -> None:
        self.llm = llm or OllamaClient()

    def faithfulness(self, answer: str, context: str, raise_on_error: bool = False) -> float:
        """
        Evaluate whether the generated answer is grounded in the provided
        context (i.e., no hallucinations).

        Returns:
            float: Score between 0.0 and 1.0
        """
        prompt = f"""
You are an expert evaluator.

Evaluate whether the generated answer is faithful to the provided context.
The answer should contain only facts directly supported by the context.

Context:
{context}

Generated Answer:
{answer}

Return ONLY a JSON object:

{{
  "score": <integer_from_0_to_100>,
  "reasoning": "<brief_reasoning>"
}}
"""

        try:
            response = self.llm.generate(prompt)
            score = self._parse_json_score(response, raise_on_error=raise_on_error)
            return score / 100.0

        except Exception as exc:
            logger.error(
                "Failed to compute faithfulness score: %s",
                exc,
                exc_info=True,
            )
            if raise_on_error:
                raise GenerationEvaluationError(f"Faithfulness evaluation failed: {exc}") from exc
            return 0.0

    def context_relevance(self, query: str, context: str, raise_on_error: bool = False) -> float:
        """
        Evaluate whether the retrieved context is relevant to the query.

        Returns:
            float: Score between 0.0 and 1.0
        """
        prompt = f"""
You are an expert evaluator.

Evaluate whether the retrieved context is relevant and useful for answering
the user query.

Query:
{query}

Retrieved Context:
{context}

Return ONLY a JSON object:

{{
  "score": <integer_from_0_to_100>,
  "reasoning": "<brief_reasoning>"
}}
"""

        try:
            response = self.llm.generate(prompt)
            score = self._parse_json_score(response, raise_on_error=raise_on_error)
            return score / 100.0

        except Exception as exc:
            logger.error(
                "Failed to compute context relevance score: %s",
                exc,
                exc_info=True,
            )
            if raise_on_error:
                raise GenerationEvaluationError(f"Context relevance evaluation failed: {exc}") from exc
            return 0.0

    def answer_relevance(self, query: str, answer: str, raise_on_error: bool = False) -> float:
        """
        Evaluate whether the generated answer directly addresses the query.

        Returns:
            float: Score between 0.0 and 1.0
        """
        prompt = f"""
You are an expert evaluator.

Evaluate whether the generated answer directly addresses the user query.

Score lower if the answer:
- is vague
- is incomplete
- misses important parts of the query
- contains irrelevant information

Query:
{query}

Generated Answer:
{answer}

Return ONLY a JSON object:

{{
  "score": <integer_from_0_to_100>,
  "reasoning": "<brief_reasoning>"
}}
"""

        try:
            response = self.llm.generate(prompt)
            score = self._parse_json_score(response, raise_on_error=raise_on_error)
            return score / 100.0

        except Exception as exc:
            logger.error(
                "Failed to compute answer relevance score: %s",
                exc,
                exc_info=True,
            )
            if raise_on_error:
                raise GenerationEvaluationError(f"Answer relevance evaluation failed: {exc}") from exc
            return 0.0

    def answer_correctness(
        self,
        query: str,
        answer: str,
        ground_truth: str,
        raise_on_error: bool = False,
    ) -> float:
        """
        Compare the generated answer with the ground truth.

        Returns:
            float: Score between 0.0 and 1.0
        """
        prompt = f"""
Compare the generated answer with the ground truth.

Query:
{query}

Ground Truth:
{ground_truth}

Generated Answer:
{answer}

Return JSON:

{{
  "score": <0-100>,
  "reasoning": "<brief_reasoning>"
}}
"""
        try:
            response = self.llm.generate(prompt)
            score = self._parse_json_score(response, raise_on_error=raise_on_error)
            return score / 100.0
        except Exception as exc:
            logger.error(
                "Failed to compute answer correctness score: %s",
                exc,
                exc_info=True,
            )
            if raise_on_error:
                raise GenerationEvaluationError(f"Answer correctness evaluation failed: {exc}") from exc
            return 0.0

    def _parse_json_score(self, text: str, raise_on_error: bool = False) -> int:
        """
        Extract score from LLM JSON output.

        Supports:
        - Raw JSON
        - JSON inside markdown code blocks
        - Partial JSON responses

        Returns:
            int: Score between 0 and 100
        """
        try:
            cleaned_text = text.strip()
            cleaned_text = cleaned_text.replace("```json", "")
            cleaned_text = cleaned_text.replace("```", "")

            json_match = re.search(
                r"\{.*?\}",
                cleaned_text,
                re.DOTALL,
            )

            if json_match:
                data = json.loads(json_match.group())
                score = int(data.get("score", 0))
                return max(0, min(100, score))

        except Exception as exc:
            logger.warning("JSON parsing failed: %s", exc)

        match = re.search(r'"score"\s*:\s*(\d+)', text)
        if match:
            score = int(match.group(1))
            return max(0, min(100, score))

        logger.warning("Could not extract score from evaluator output: %s", text[:200])
        if raise_on_error:
            raise GenerationEvaluationError(f"Could not parse valid score from output: {text[:100]}")
        return 0
