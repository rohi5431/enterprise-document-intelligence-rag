# test_large_prompt.py

from rag.llm.ollama_client import OllamaClient

client = OllamaClient()

with open("last_prompt.txt", "r", encoding="utf-8") as f:
    prompt = f.read()

prompt = prompt.encode(
    "ascii",
    errors="ignore"
).decode()

print(client.generate(prompt))