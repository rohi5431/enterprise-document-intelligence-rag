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

response = client.generate(prompt)

print("\nANSWER:")
print(response)