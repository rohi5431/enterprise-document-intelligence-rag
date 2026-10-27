from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_admin, get_current_user
from app.models.user import User
from app.models.evaluation_log import EvaluationLog
from evaluation.evaluator import RAGEvaluator

router = APIRouter(prefix="/evaluation", tags=["Evaluation"])


class EvaluationRequest(BaseModel):
    query: str
    answer: str
    context: str
    retrieved_ids: list[str] = []
    ground_truth_ids: list[str] = []
    ground_truth_answer: str = ""


class EvaluationResponse(BaseModel):
    recall_at_k: float
    mrr: float
    faithfulness: float
    answer_relevancy: float
    context_precision: float
    metrics: dict


@router.post("/run", response_model=EvaluationResponse)
def run_evaluation(
    req: EvaluationRequest,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Run RAG evaluation metrics and store results (Admin only)."""
    evaluator = RAGEvaluator()
    scores = evaluator.evaluate(
        query=req.query,
        answer=req.answer,
        context=req.context,
        retrieved_ids=req.retrieved_ids,
        ground_truth_ids=req.ground_truth_ids,
        ground_truth_answer=req.ground_truth_answer,
    )

    log = EvaluationLog(
        user_id=current_user.id,
        query=req.query,
        answer=req.answer,
        recall_at_k=scores.get("retrieval", {}).get("recall@5", 0),
        mrr=scores.get("retrieval", {}).get("mrr", 0),
        faithfulness=scores.get("generation", {}).get("faithfulness", 0),
        answer_relevancy=scores.get("generation", {}).get("answer_relevance", 0),
        context_precision=scores.get("generation", {}).get("context_relevance", 0),
        metrics=scores,
    )
    db.add(log)
    db.commit()

    return EvaluationResponse(
        recall_at_k=log.recall_at_k or 0,
        mrr=log.mrr or 0,
        faithfulness=log.faithfulness or 0,
        answer_relevancy=log.answer_relevancy or 0,
        context_precision=log.context_precision or 0,
        metrics=scores,
    )


@router.get("/logs")
def get_evaluation_logs(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List stored evaluation logs (Admin only)."""
    q = db.query(EvaluationLog).order_by(EvaluationLog.created_at.desc())
    total = q.count()
    logs = q.offset(skip).limit(limit).all()
    return {
        "logs": [
            {
                "id": log.id,
                "query": log.query,
                "recall_at_k": log.recall_at_k,
                "mrr": log.mrr,
                "faithfulness": log.faithfulness,
                "answer_relevancy": log.answer_relevancy,
                "context_precision": log.context_precision,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ],
        "total": total,
    }
