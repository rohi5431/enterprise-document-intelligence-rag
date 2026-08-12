# from rag.llm.ollama_client import OllamaClient

# client = OllamaClient()

# answer = client.generate(
#     "What skills are mentioned in Rohit's resume?"
# )

# print("\nANSWER:")
# print(answer)

# test_gemma.py

import requests

response = requests.post(
    "http://localhost:11434/api/generate",
    json={
        "model": "gemma2:2b",
        "prompt": "What is Python?",
        "stream": False
    },
    timeout=300
)

print(response.json()["response"])