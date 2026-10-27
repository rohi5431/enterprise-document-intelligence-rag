from rag.llm.ollama_client import OllamaClient

client = OllamaClient()

prompt = """
Context:
Rohit knows:
Node.js
Express.js
React.js
MongoDB
Python
Redis
DSA
System Design

Question:
What skills are mentioned in Rohit's resume?

Answer:
"""

print("PROMPT SIZE =", len(prompt))

answer = client.generate(prompt)

print("\nANSWER:\n")
print(answer)