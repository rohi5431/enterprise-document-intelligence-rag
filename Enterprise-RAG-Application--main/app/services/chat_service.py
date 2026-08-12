from rag.pipelines.rag_pipeline import run_rag

class ChatService:
    def send_message(self, user_id: int, query: str):
        """Send a message and get RAG-powered response"""
        try:
            result = run_rag(query)
            return {
                "user_id": user_id,
                "query": query,
                "response": result.get("answer", ""),
                "sources": result.get("sources", []),
                "num_sources": result.get("num_sources", 0)
            }
        except Exception as e:
            return {
                "user_id": user_id,
                "query": query,
                "response": f"Error: {str(e)}",
                "sources": [],
                "num_sources": 0
            }
