import requests
import time

payload = {
    "model": "phi3",
    "prompt": "What is Python?",
    "stream": False
}

start = time.time()

response = requests.post(
    "http://localhost:11434/api/generate",
    json=payload,
    timeout=(10, 300)
)

print("TIME =", time.time() - start)
print(response.status_code)
print(response.json()["response"])