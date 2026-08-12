"""
Prompt Templates — formats inputs for LLM generation
"""
from __future__ import annotations

# RAG answering template
RAG_PROMPT_TEMPLATE = """You are a helpful AI assistant. Use the following context to answer the question. 
If the context doesn't contain relevant information, say so. Answer ONLY based on the context.

Context:
{context}

Question:
{question}

Answer:"""

# Conversation summarization template
SUMMARIZATION_TEMPLATE = """Write a concise, rolling summary of the conversation history below, incorporating the new messages. Maintain key facts, topics discussed, and user preferences. Keep it under 150 words.

Current Summary:
{current_summary}

Recent Turn:
User: {user_message}
Assistant: {assistant_message}

New Summary:"""


def get_rag_prompt(question: str, context: str) -> str:
    """Format question and context into the RAG answering prompt."""
    return RAG_PROMPT_TEMPLATE.format(question=question, context=context)


def get_summarization_prompt(current_summary: str | None, user_msg: str, assistant_msg: str) -> str:
    """Format rolling summary prompt."""
    return SUMMARIZATION_TEMPLATE.format(
        current_summary=current_summary or "No summary yet.",
        user_message=user_msg,
        assistant_message=assistant_msg,
    )
