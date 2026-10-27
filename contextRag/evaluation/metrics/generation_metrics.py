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


class GenerationEvaluator:
    """
    Uses Ollama to evaluate RAG generation quality metrics.
    """

    def __init__(self, llm: Optional[OllamaClient] = None) -> None:
        self.llm = llm or OllamaClient()

    def faithfulness(self, answer: str, context: str) -> float:
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
            score = self._parse_json_score(response)
            return score / 100.0

        except Exception as exc:
            logger.error(
                "Failed to compute faithfulness score: %s",
                exc,
                exc_info=True,
            )
            return 0.5

    def context_relevance(self, query: str, context: str) -> float:
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
            score = self._parse_json_score(response)
            return score / 100.0

        except Exception as exc:
            logger.error(
                "Failed to compute context relevance score: %s",
                exc,
                exc_info=True,
            )
            return 0.5

    def answer_relevance(self, query: str, answer: str) -> float:
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
            score = self._parse_json_score(response)
            return score / 100.0

        except Exception as exc:
            logger.error(
                "Failed to compute answer relevance score: %s",
                exc,
                exc_info=True,
            )
            return 0.5

    def _parse_json_score(self, text: str) -> int:
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
            # Remove markdown fences if present
            cleaned_text = text.strip()
            cleaned_text = cleaned_text.replace("```json", "")
            cleaned_text = cleaned_text.replace("```", "")

            # Extract first JSON object
            json_match = re.search(
                r"\{.*?\}",
                cleaned_text,
                re.DOTALL,
            )

            if json_match:
                data = json.loads(json_match.group())

                score = int(data.get("score", 50))
                return max(0, min(100, score))

        except Exception as exc:
            logger.warning(
                "JSON parsing failed: %s",
                exc,
            )

        # Fallback regex extraction
        match = re.search(
            r'"score"\s*:\s*(\d+)',
            text,
        )

        if match:
            score = int(match.group(1))
            return max(0, min(100, score))

        logger.warning(
            "Could not extract score from evaluator output: %s",
            text[:200],
        )

        return 50
def answer_correctness(
    self,
    query: str,
    answer: str,
    ground_truth: str
) -> float:

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

        response = self.llm.generate(
            prompt
        )

        score = self._parse_json_score(
            response
        )

        return score / 100.0

    except Exception:

        return 0.5