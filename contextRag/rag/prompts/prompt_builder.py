"""
Prompt Builder
==============
Constructs prompts for RAG generation.

Supports:
- Retrieved context
- Conversation memory
- Source-aware prompting
"""

from __future__ import annotations

from typing import List, Optional

from rag.retrieval.schemas import RetrievedChunk

RAG_INSTRUCTIONS = """You are a precise document assistant. Answer using ONLY the context below.

Rules:
1. Scan every context chunk before answering. Resume/CV questions often span multiple sections (summary, education, skills, projects, achievements).
2. For project questions, look for headings like "PROJECT EXPERIENCE", "Projects", "Work Experience", or bullet lists describing built systems.
3. If the user asks for one project but several exist, list all project names/titles found, then answer the specific one requested.
4. If the user asks for "the project name" (singular) and multiple projects exist, list all names and briefly identify each.
5. Use exact names, numbers, and phrases from the context. Cite sources as [1], [2], etc. when helpful.
6. If you find partial information, share what is available and state what is missing.
7. Say "I could not find that information in the provided documents." ONLY when the context has zero relevant facts.
8. Never invent information not present in the context."""


class PromptBuilder:
    """
    Builds prompts for LLM generation.
    """

    def build(
        self,
        query: str,
        chunks: List[RetrievedChunk],
        conversation_history: Optional[str] = None,
    ) -> str:

        context = self._build_context(chunks)

        history_section = ""
        if conversation_history:
            history_section = (
                "Conversation History (for follow-up context only — "
                "prefer the Context section for facts):\n"
                f"{conversation_history.strip()}\n"
            )

        prompt = f"""{RAG_INSTRUCTIONS}

{history_section}
Context:
{context}

Question:
{query.strip()}

Answer:""".strip()

        return prompt

    def _build_context(
        self,
        chunks: List[RetrievedChunk],
    ) -> str:

        context_parts = []

        for idx, chunk in enumerate(chunks, start=1):

            source = (
                chunk.doc_filename
                or chunk.doc_title
                or f"Doc {chunk.doc_id}"
            )

            page = (
                f"Page {chunk.page_number}"
                if chunk.page_number is not None
                else "Page Unknown"
            )

            context_parts.append(
                f"[{idx}] ({source}) {page}\n"
                f"{chunk.text}"
            )

        return "\n\n---\n\n".join(context_parts)
