# from app.core.config import settings

# print("OLLAMA_BASE_URL =", settings.OLLAMA_BASE_URL)
# print("OLLAMA_MODEL =", settings.OLLAMA_MODEL)
# print("OLLAMA_TIMEOUT =", settings.OLLAMA_TIMEOUT)

from rag.llm.ollama_client import OllamaClient

client = OllamaClient()

print(client.generate("What is Python?"))