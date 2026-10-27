# test_stream.py

from rag.llm.ollama_client import OllamaClient

client = OllamaClient()

for token in client.generate_stream(
    "Explain Retrieval Augmented Generation in simple words."
):
    print(token, end="", flush=True)