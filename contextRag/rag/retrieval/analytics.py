"""
Retrieval Analytics
====================
Thread-safe in-process metrics store that records every retrieval event
and exposes aggregated statistics for dashboards and monitoring hooks.

All writes are O(1) amortised; reads take O(N) over the rolling window.
For production persistence, swap the in-memory store for Redis or a
time-series DB (e.g. Prometheus Pushgateway).
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Event model
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RetrievalEvent:
    """Immutable record captured after each retrieval call."""
    query: str
    mode: str
    user_id: Optional[int]
    vector_candidates: int
    bm25_candidates: int
    chunks_returned: int
    latency_total_ms: float
    latency_breakdown: Dict[str, float]
    tags_filter: List[str]
    expanded_query_count: int
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Analytics store
# ---------------------------------------------------------------------------

class RetrievalAnalytics:
    """
    Rolling window analytics store for retrieval events.

    Parameters
    ----------
    max_events:
        Maximum events retained in memory.  Oldest events are discarded
        when the window is full (deque with maxlen).
    """

    def __init__(self, max_events: int = 10_000) -> None:
        self._events: Deque[RetrievalEvent] = deque(maxlen=max_events)
        self._lock = threading.Lock()

        # Running counters — updated on every record() call
        self._total_queries: int = 0
        self._total_errors: int = 0
        self._total_latency_ms: float = 0.0
        self._mode_counts: Dict[str, int] = {}
        self._query_counts: Dict[str, int] = {}  # top queries

    # ------------------------------------------------------------------ #
    # Write                                                                #
    # ------------------------------------------------------------------ #

    def record(self, event: RetrievalEvent) -> None:
        """Append *event* to the analytics store and update counters."""
        with self._lock:
            self._events.append(event)
            self._total_queries += 1
            self._total_latency_ms += event.latency_total_ms
            if event.error:
                self._total_errors += 1
            self._mode_counts[event.mode] = (
                self._mode_counts.get(event.mode, 0) + 1
            )
            q_key = event.query.strip().lower()[:120]
            self._query_counts[q_key] = self._query_counts.get(q_key, 0) + 1

        logger.debug(
            "Analytics recorded: mode=%s latency=%.1f ms chunks=%d",
            event.mode,
            event.latency_total_ms,
            event.chunks_returned,
        )

    # ------------------------------------------------------------------ #
    # Read                                                                 #
    # ------------------------------------------------------------------ #

    def summary(self) -> Dict[str, Any]:
        """Return a high-level summary suitable for dashboard display."""
        with self._lock:
            events = list(self._events)
            total = self._total_queries
            errors = self._total_errors
            total_lat = self._total_latency_ms
            mode_counts = dict(self._mode_counts)

        if not events:
            return {
                "total_queries": 0,
                "message": "No retrieval events recorded yet",
            }

        latencies = [e.latency_total_ms for e in events]
        chunks_returned = [e.chunks_returned for e in events]
        vector_candidates = [e.vector_candidates for e in events]
        bm25_candidates = [e.bm25_candidates for e in events]

        return {
            "total_queries": total,
            "total_errors": errors,
            "error_rate": round(errors / max(total, 1), 4),
            "avg_latency_ms": round(total_lat / max(total, 1), 2),
            "p50_latency_ms": round(_percentile(latencies, 50), 2),
            "p95_latency_ms": round(_percentile(latencies, 95), 2),
            "p99_latency_ms": round(_percentile(latencies, 99), 2),
            "avg_chunks_returned": round(sum(chunks_returned) / len(chunks_returned), 2),
            "avg_vector_candidates": round(sum(vector_candidates) / len(vector_candidates), 2),
            "avg_bm25_candidates": round(sum(bm25_candidates) / len(bm25_candidates), 2),
            "mode_distribution": mode_counts,
            "window_size": len(events),
        }

    def top_queries(self, n: int = 20) -> List[Dict[str, Any]]:
        """Return the *n* most frequent queries."""
        with self._lock:
            counts = dict(self._query_counts)
        sorted_q = sorted(counts.items(), key=lambda x: x[1], reverse=True)
        return [{"query": q, "count": c} for q, c in sorted_q[:n]]

    def recent_events(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return the most recent *limit* events as dicts."""
        with self._lock:
            events = list(self._events)[-limit:]
        return [asdict(e) for e in reversed(events)]

    def latency_breakdown_avg(self) -> Dict[str, float]:
        """Average per-stage latency across all events."""
        with self._lock:
            events = list(self._events)
        if not events:
            return {}

        stage_totals: Dict[str, float] = {}
        stage_counts: Dict[str, int] = {}

        for e in events:
            for stage, ms in e.latency_breakdown.items():
                stage_totals[stage] = stage_totals.get(stage, 0.0) + ms
                stage_counts[stage] = stage_counts.get(stage, 0) + 1

        return {
            stage: round(total / stage_counts[stage], 2)
            for stage, total in stage_totals.items()
        }

    def mode_stats(self) -> Dict[str, Dict[str, float]]:
        """Per-mode statistics (avg latency, avg chunks, error rate)."""
        with self._lock:
            events = list(self._events)

        by_mode: Dict[str, List[RetrievalEvent]] = {}
        for e in events:
            by_mode.setdefault(e.mode, []).append(e)

        result: Dict[str, Dict[str, float]] = {}
        for mode, evts in by_mode.items():
            lats = [e.latency_total_ms for e in evts]
            errs = sum(1 for e in evts if e.error)
            result[mode] = {
                "count": len(evts),
                "avg_latency_ms": round(sum(lats) / len(lats), 2),
                "error_rate": round(errs / len(evts), 4),
                "avg_chunks": round(
                    sum(e.chunks_returned for e in evts) / len(evts), 2
                ),
            }
        return result

    def clear(self) -> None:
        """Reset all stored events and counters."""
        with self._lock:
            self._events.clear()
            self._total_queries = 0
            self._total_errors = 0
            self._total_latency_ms = 0.0
            self._mode_counts.clear()
            self._query_counts.clear()


# ---------------------------------------------------------------------------
# Percentile helper
# ---------------------------------------------------------------------------

def _percentile(data: List[float], p: int) -> float:
    if not data:
        return 0.0
    sorted_data = sorted(data)
    idx = int(len(sorted_data) * p / 100)
    idx = min(idx, len(sorted_data) - 1)
    return sorted_data[idx]


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_analytics = RetrievalAnalytics()


def get_analytics() -> RetrievalAnalytics:
    """Return the process-wide analytics singleton."""
    return _analytics
