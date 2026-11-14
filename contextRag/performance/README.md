# Isolated Performance Harness

This directory contains a Locust harness for the authoritative FastAPI API.
It is **not a benchmark result**: the Phase 5 pass found no FastAPI listener,
and no load was run. All scenarios require explicit opt-in and a loopback target
to reduce the chance of hitting a shared or production service.

## Safety prerequisites

1. Use a disposable PostgreSQL database, a dedicated local Qdrant instance and
   fresh test collection, and a dedicated Redis instance/namespace.
2. Never point FastAPI at production: its lifespan calls `Base.metadata.create_all`
   and loads stored chunks. Its configuration currently resolves from the
   process environment and `.env` in the working directory.
3. Keep the runner on loopback. `locustfile.py` stops unless
   `PERF_ENVIRONMENT=isolated` and the target host is `localhost`, `127.0.0.1`,
   or `::1`.
4. Provide a dedicated test user's credentials through the environment, or a
   short-lived isolated-test access token. No credential is stored in this
   repository or written to Locust labels.
5. Chat creates sessions/messages and uploads create persistent document data.
   Those scenarios also require explicit mutation opt-in. The upload scenario
   is limited to one upload per simulated user; it does not delete remote data.
6. API login is rate-limited. Requests rejected with 429 are reported as
   failures; do not disable security controls to improve a result.

## Install Locust in an isolated environment

Use the optional test dependency file, not the application requirements:

```powershell
Set-Location D:\ContextRagSystem\contextRag
$perfVenv = Join-Path $env:TEMP 'contextrag-phase5-venv'
python -m venv $perfVenv
& (Join-Path $perfVenv 'Scripts\python.exe') -m pip install -r performance\requirements.txt
```

Do not install these tools globally. No package installation was performed for
this phase.

## Configure test-only access

In the Locust shell, set `PERF_ENVIRONMENT=isolated`, `PERF_TEST_EMAIL` and
`PERF_TEST_PASSWORD`, or set `PERF_ACCESS_TOKEN` for non-authentication
scenarios. Set `PERF_TARGET_URL=http://127.0.0.1:8000` only after confirming
that FastAPI points to disposable infrastructure. Avoid putting passwords or
tokens in command-line arguments, logs, or reports.

Mutation scenarios additionally need `PERF_ALLOW_MUTATIONS=YES`. The document
upload class also requires `PERF_ALLOW_UPLOADS=YES`, `PERF_UPLOAD_FILE` pointing
to a sanitized local PDF, and an isolated admin test account. Optional
`PERF_OWN_DOCUMENT_ID`, `PERF_OWN_TASK_ID`, and `PERF_FOREIGN_DOCUMENT_ID`
allow testing owned-resource reads and expected 403/404 concealment.

The current FastAPI auth router has no logout endpoint; the authentication
scenario covers login, token validation, and refresh rather than inventing a
logout request.

## Controlled runs

Run one class at a time and keep to the proposed progression (1, 2, 5, 10, then
at most 20 users). The harness enforces a 20-user ceiling. Stop immediately on
sustained errors or unsafe resource use. Choose a unique run stem; never
overwrite existing results.

```powershell
$run = 'auth-smoke-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
& (Join-Path $env:TEMP 'contextrag-phase5-venv\Scripts\locust.exe') `
  -f performance\locustfile.py `
  --host http://127.0.0.1:8000 `
  --headless --user-classes AuthenticationScenarioUser `
  -u 1 -r 1 -t 2m `
  --csv "performance\results\$run" `
  --html "performance\results\$run.html"
```

Replace the user class with `DocumentWorkflowUser`, `RagChatUser`,
`MixedWorkloadUser`, or `DocumentUploadUser` for the corresponding scenario.
Do not enable mutations on a persistent database. For each run, retain the CSV
files and HTML report together with environment/model settings that contain no
secrets.

## Current Phase 5 status

- Locust was not installed; the harness received syntax compilation only.
- FastAPI and Vite were not listening; Celery had no matching worker process.
- PostgreSQL, Redis, Qdrant, and Ollama endpoint probes are documented in
  `../evaluation/PHASE5_PERFORMANCE_BASELINE.md`; those checks do not prove
  application-level authentication or an end-to-end workflow.
- No request load, upload, live RAG benchmark, or infrastructure mutation was
  performed.
