# debug_phi3.py

from rag.llm.ollama_client import OllamaClient

client = OllamaClient()

prompt = """
Context:
Node.js
Express.js
React.js
MongoDB
Python
Redis

Question:
What skills are mentioned?

Answer:
"""

print(client.generate(prompt))