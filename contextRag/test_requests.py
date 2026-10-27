# test_requests.py

import requests

response = requests.post(
    "http://localhost:11434/api/generate",
    json={
        "model": "phi3",
        "prompt": "What is Python?",
        "stream": False
    },
    timeout=60
)

print(response.status_code)
print(response.text[:500])