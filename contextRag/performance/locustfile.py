from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

from locust import HttpUser, between, events, task
from locust.exception import StopUser


_API = "/api/v1"
_SEARCH_QUERY = "context rag architecture"
_CHAT_QUERY = "What capabilities are documented in the isolated test corpus?"


def _is_loopback(url: str) -> bool:
    hostname = urlparse(url).hostname
    return hostname in {"localhost", "127.0.0.1", "::1"}


@events.test_start.add_listener
def enforce_user_ceiling(environment, **_kwargs) -> None:
    options = getattr(environment, "parsed_options", None)
    user_count = getattr(options, "num_users", 1) or 1
    if user_count > 20:
        environment.runner.quit()
        raise RuntimeError("Phase 5 harness is capped at 20 concurrent users.")


class AuthenticatedApiUser(HttpUser):
    abstract = True
    host = os.getenv("PERF_TARGET_URL", "http://127.0.0.1:8000")
    wait_time = between(1, 3)
    force_login = False

    def on_start(self) -> None:
        if (
            os.getenv("PERF_ENVIRONMENT") != "isolated"
            or not _is_loopback(self.host)
        ):
            self.environment.runner.quit()
            raise StopUser()

        self.session_id: int | None = None
        self.refresh_token: str | None = None
        self.document_id: int | None = None
        self._uploaded = False

        access_token = os.getenv("PERF_ACCESS_TOKEN")
        if access_token and not self.force_login:
            self._set_access_token(access_token)
        else:
            self._login()

    def _set_access_token(self, token: str) -> None:
        self.client.headers.update({"Authorization": f"Bearer {token}"})

    def _login(self) -> None:
        email = os.getenv("PERF_TEST_EMAIL")
        password = os.getenv("PERF_TEST_PASSWORD")
        if not email or not password:
            self.environment.runner.quit()
            raise StopUser()

        with self.client.post(
            f"{_API}/auth/login",
            json={"email": email, "password": password},
            name="POST /api/v1/auth/login",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"login returned HTTP {response.status_code}")
                self.environment.runner.quit()
                raise StopUser()
            try:
                tokens = response.json()
                access_token = tokens["access_token"]
                self.refresh_token = tokens.get("refresh_token")
            except (KeyError, ValueError, TypeError):
                response.failure("login response did not contain an access token")
                self.environment.runner.quit()
                raise StopUser()

        self._set_access_token(access_token)

    def _get(self, path: str, name: str, expected: tuple[int, ...] = (200,)):
        with self.client.get(
            path,
            name=name,
            catch_response=True,
        ) as response:
            if response.status_code not in expected:
                response.failure(f"returned HTTP {response.status_code}")
            else:
                response.success()
        return response

    def _post(self, path: str, name: str, **kwargs):
        with self.client.post(
            path,
            name=name,
            catch_response=True,
            **kwargs,
        ) as response:
            if not response.ok:
                response.failure(f"returned HTTP {response.status_code}")
            else:
                response.success()
        return response

    def _require_mutation_opt_in(self) -> bool:
        return os.getenv("PERF_ALLOW_MUTATIONS") == "YES"

    @task
    def validate_token(self) -> None:
        self._get(f"{_API}/auth/me", "GET /api/v1/auth/me")


class AuthenticationScenarioUser(AuthenticatedApiUser):
    force_login = True

    @task(3)
    def validate_access_token(self) -> None:
        self.validate_token()

    @task(1)
    def refresh_access_token(self) -> None:
        if not self.refresh_token:
            return
        response = self._post(
            f"{_API}/auth/refresh",
            "POST /api/v1/auth/refresh",
            json={"refresh_token": self.refresh_token},
        )
        if response.ok:
            try:
                tokens = response.json()
                self._set_access_token(tokens["access_token"])
                self.refresh_token = tokens.get("refresh_token", self.refresh_token)
            except (KeyError, ValueError, TypeError):
                response.failure("refresh response did not contain an access token")


class DocumentWorkflowUser(AuthenticatedApiUser):
    @task(4)
    def list_documents(self) -> None:
        self._get(
            f"{_API}/documents/?skip=0&limit=20",
            "GET /api/v1/documents/",
        )

    @task(2)
    def read_owned_document(self) -> None:
        document_id = os.getenv("PERF_OWN_DOCUMENT_ID")
        if document_id and document_id.isdigit():
            self._get(
                f"{_API}/documents/{document_id}",
                "GET /api/v1/documents/[id]",
            )

    @task(1)
    def read_owned_job(self) -> None:
        task_id = os.getenv("PERF_OWN_TASK_ID")
        if task_id:
            self._get(
                f"{_API}/documents/job/{task_id}",
                "GET /api/v1/documents/job/[task_id]",
            )

    @task(1)
    def verify_foreign_document_is_denied(self) -> None:
        document_id = os.getenv("PERF_FOREIGN_DOCUMENT_ID")
        if document_id and document_id.isdigit():
            self._get(
                f"{_API}/documents/{document_id}",
                "GET /api/v1/documents/[foreign-id]",
                expected=(403, 404),
            )


class RagChatUser(AuthenticatedApiUser):
    def on_start(self) -> None:
        super().on_start()
        if not self._require_mutation_opt_in():
            self.environment.runner.quit()
            raise StopUser()

    def _ensure_session(self) -> None:
        if self.session_id is not None:
            return
        response = self._post(
            f"{_API}/chat/sessions",
            "POST /api/v1/chat/sessions",
            json={"title": "Isolated performance test"},
        )
        if response.ok:
            try:
                self.session_id = int(response.json()["id"])
            except (KeyError, ValueError, TypeError):
                response.failure("session response did not contain an id")

    @task(3)
    def ask_question(self) -> None:
        self._ensure_session()
        if self.session_id is None:
            return
        self._post(
            f"{_API}/chat/message",
            "POST /api/v1/chat/message",
            json={"query": os.getenv("PERF_CHAT_QUERY", _CHAT_QUERY),
                  "session_id": self.session_id,
                  "top_k": 5,
                  "final_top_k": 3},
        )

    @task(1)
    def read_session_history(self) -> None:
        if self.session_id is not None:
            self._get(
                f"{_API}/chat/sessions/{self.session_id}/messages",
                "GET /api/v1/chat/sessions/[id]/messages",
            )


class MixedWorkloadUser(RagChatUser):
    @task(5)
    def list_documents(self) -> None:
        self._get(
            f"{_API}/documents/?skip=0&limit=20",
            "GET /api/v1/documents/",
        )

    @task(3)
    def semantic_search(self) -> None:
        self.client.get(
            f"{_API}/search/",
            params={"q": _SEARCH_QUERY, "top_k": 5},
            name="GET /api/v1/search/",
        )

    @task(2)
    def list_sessions(self) -> None:
        self._get(
            f"{_API}/chat/sessions?skip=0&limit=20",
            "GET /api/v1/chat/sessions",
        )


class DocumentUploadUser(AuthenticatedApiUser):
    def on_start(self) -> None:
        super().on_start()
        upload_path = os.getenv("PERF_UPLOAD_FILE")
        if (
            os.getenv("PERF_ALLOW_MUTATIONS") != "YES"
            or os.getenv("PERF_ALLOW_UPLOADS") != "YES"
            or not upload_path
            or not Path(upload_path).is_file()
        ):
            self.environment.runner.quit()
            raise StopUser()

    @task
    def upload_once(self) -> None:
        if self._uploaded:
            if self.document_id is not None:
                self._get(
                    f"{_API}/documents/{self.document_id}",
                    "GET /api/v1/documents/[uploaded-id]",
                )
            return

        upload_path = Path(os.environ["PERF_UPLOAD_FILE"])
        with upload_path.open("rb") as upload:
            response = self._post(
                f"{_API}/documents/upload",
                "POST /api/v1/documents/upload",
                files={"file": (upload_path.name, upload, "application/pdf")},
                data={"title": "Isolated performance upload"},
            )
        self._uploaded = True
        if response.ok:
            try:
                self.document_id = int(response.json()["id"])
            except (KeyError, ValueError, TypeError):
                response.failure("upload response did not contain a document id")
