"""
Ollama LLM Client — wraps local Ollama service calls
"""
from __future__ import annotations

import logging
import json
import requests

from app.core.config import settings

logger = logging.getLogger(__name__)


class OllamaClient:
    """Local Ollama client utilizing request configuration and timeouts from settings."""

    def __init__(self, base_url: str | None = None, model: str | None = None) -> None:
        self.base_url = base_url or settings.OLLAMA_BASE_URL
        self.model = model or settings.OLLAMA_MODEL
        self.timeout = settings.OLLAMA_TIMEOUT

    def generate(self, prompt: str, stream: bool = False) -> str:
        """Call Ollama generation endpoint for the prompt."""
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_predict": 300,
                "temperature": 0.1
                # "num_ctx": 2048
            }
        }

        try:
            logger.info("OllamaClient: Generating with model=%s", self.model)
            print("🔥 CALLING OLLAMA API...")

            print("URL =", url)
            print("MODEL =", self.model)
            with open("last_prompt.txt", "w", encoding="utf-8") as f:
                f.write(prompt)
            
            print("PROMPT SAVED")
            print("PROMPT SIZE =", len(prompt))
            response = requests.post(
                url,
                json=payload,
                timeout=self.timeout,
                stream=True
            )
            
            print("🔥 OLLAMA RESPONDED")
            
            if response.status_code != 200:
                logger.error("Ollama API failed with status %d: %s", response.status_code, response.text)
                raise RuntimeError(f"Ollama API returned status {response.status_code}")

            if stream:
                full_response = []
                for line in response.iter_lines():
                    if line:
                        data = json.loads(line)
                        full_response.append(data.get("response", ""))
                return "".join(full_response)
            else:
                data = response.json()

                print("🔥 RESPONSE JSON RECEIVED")
                print(data)
                
                return data.get("response", "")
        except requests.Timeout as exc:
            logger.error("Ollama client request timed out after %d seconds", self.timeout)
            raise RuntimeError(f"Ollama generation timed out: {exc}")
        except Exception as exc:
            logger.error("Ollama generation error: %s", exc)
            raise RuntimeError(f"Ollama generation failed: {exc}")
        
    def generate_stream(self, prompt: str):
        """
        Stream tokens from Ollama.
        """
    
        url = f"{self.base_url}/api/generate"
    
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": True,
            "options": {
                "num_predict": 300,
                "temperature": 0.1,
            },
        }
    
        try:
            response = requests.post(
                url,
                json=payload,
                timeout=self.timeout,
                stream=True,
            )
    
            response.raise_for_status()
    
            for line in response.iter_lines():
    
                if not line:
                    continue
    
                data = json.loads(line.decode("utf-8"))
    
                token = data.get("response", "")
    
                if token:
                    yield token
    
                if data.get("done", False):
                    break
    
        except Exception as exc:
            logger.error("Streaming generation failed: %s", exc)
            raise RuntimeError(f"Streaming generation failed: {exc}")

    def is_available(self) -> bool:
        """Check if local Ollama service tag list is reachable."""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return response.status_code == 200
        except Exception:
            return False
