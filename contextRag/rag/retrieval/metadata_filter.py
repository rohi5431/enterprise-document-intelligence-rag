"""
Metadata Filter Builder
========================
Translates a :class:`MetadataFilter` dataclass into a Qdrant
``models.Filter`` object.  Kept separate from the retrievers so that
both Vector and BM25 paths can import it without circular dependencies.
"""

from __future__ import annotations

import logging
from typing import List, Optional

from qdrant_client.models import (
    FieldCondition,
    Filter,
    MatchAny,
    MatchValue,
    Range,
)

from rag.retrieval.schemas import MetadataFilter

logger = logging.getLogger(__name__)


class MetadataFilterBuilder:
    """
    Converts application-level :class:`MetadataFilter` into a Qdrant
    ``Filter`` that can be attached to any search / scroll request.

    Example
    -------
    >>> builder = MetadataFilterBuilder()
    >>> qdrant_filter = builder.build(MetadataFilter(user_id=42, tags=["finance"]))
    """

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def build(self, f: Optional[MetadataFilter]) -> Optional[Filter]:
        """
        Convert *f* into a Qdrant Filter.
        Returns ``None`` when no constraints are set (no filter applied).
        """
        if f is None:
            return None

        must: List[FieldCondition] = []

        # ── Multi-tenant isolation ─────────────────────────────────────
        if f.user_id is not None:
            must.append(
                FieldCondition(key="user_id", match=MatchValue(value=f.user_id))
            )
            logger.debug("Filter: user_id=%d", f.user_id)

        # ── Document ID whitelist ──────────────────────────────────────
        if f.doc_ids:
            must.append(
                FieldCondition(key="doc_id", match=MatchAny(any=f.doc_ids))
            )
            logger.debug("Filter: doc_ids=%s", f.doc_ids)

        # ── Tag filtering (AND) ────────────────────────────────────────
        if f.tags:
            for tag in f.tags:
                must.append(
                    FieldCondition(key="tags", match=MatchValue(value=tag))
                )
            logger.debug("Filter: tags (AND) %s", f.tags)

        # ── Tag filtering (OR) ─────────────────────────────────────────
        if f.any_tags:
            must.append(
                FieldCondition(key="tags", match=MatchAny(any=f.any_tags))
            )
            logger.debug("Filter: any_tags (OR) %s", f.any_tags)

        # ── File-type whitelist ────────────────────────────────────────
        if f.file_types:
            must.append(
                FieldCondition(key="file_type", match=MatchAny(any=f.file_types))
            )
            logger.debug("Filter: file_types=%s", f.file_types)

        # ── Date range ─────────────────────────────────────────────────
        range_args: dict = {}
        if f.date_from:
            range_args["gte"] = f.date_from
        if f.date_to:
            range_args["lte"] = f.date_to
        if range_args:
            must.append(FieldCondition(key="created_at", range=Range(**range_args)))
            logger.debug("Filter: date_range %s", range_args)

        # ── Arbitrary extra equality filters ──────────────────────────
        for key, value in f.extra.items():
            must.append(FieldCondition(key=key, match=MatchValue(value=value)))
            logger.debug("Filter: extra %s=%s", key, value)

        if not must:
            return None

        return Filter(must=must)
