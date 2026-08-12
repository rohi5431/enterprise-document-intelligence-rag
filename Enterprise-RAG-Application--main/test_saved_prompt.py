# test_saved_prompt.py

from rag.llm.ollama_client import OllamaClient

with open("last_prompt.txt", "r", encoding="utf-8") as f:
    prompt = f.read()

print("PROMPT LENGTH =", len(prompt))

client = OllamaClient()

answer = client.generate(prompt)

print("\nANSWER:\n")
print(answer)