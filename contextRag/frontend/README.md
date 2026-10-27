# RAG Chat UI

A React-based chat interface for the Enterprise RAG Platform backend.

## Setup

1. Install dependencies in `frontend`:
   ```bash
   cd frontend
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open the local URL shown by Vite, typically `http://127.0.0.1:5173`.

## API configuration

The frontend uses `VITE_API_URL` for the backend base URL. By default it points to `http://127.0.0.1:8000/api/v1`.

If your backend is running elsewhere, create `.env` inside `frontend` with:

```env
VITE_API_URL=http://127.0.0.1:8000/api/v1
```
