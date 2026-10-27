"""
Conversation Memory
===================
Stores recent chat history.
"""

from __future__ import annotations


class ConversationMemory:

    def __init__(
        self,
        max_turns: int = 5,
    ):
        self.max_turns = max_turns
        self.messages = []

    def add_user(
        self,
        message: str,
    ):
        self.messages.append(
            {
                "role": "user",
                "content": message,
            }
        )

    def add_assistant(
        self,
        message: str,
    ):
        self.messages.append(
            {
                "role": "assistant",
                "content": message,
            }
        )

        self.messages = self.messages[
            -(self.max_turns * 2):
        ]

    def get_context(self) -> str:

        lines = []

        for msg in self.messages:

            lines.append(
                f"{msg['role']}: "
                f"{msg['content']}"
            )

        return "\n".join(lines)

    def clear(self):
        self.messages.clear()