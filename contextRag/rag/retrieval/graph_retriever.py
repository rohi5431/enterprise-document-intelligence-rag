"""
Graph Retriever
================
Builds a lightweight entity/concept co-occurrence graph from document chunks
and uses graph traversal to find related chunks for relational queries.

Strategy
--------
1. **Index phase** (at startup): extract noun-phrases / named entities from
   each chunk using simple NLP; add edges between chunks that share entities.
2. **Retrieval phase**: given a query, extract its entities → find seed chunks
   that contain those entities → BFS-expand one hop to find related chunks →
   score by relationship count.

The graph is purely in-memory (NetworkX). It is rebuilt from the DB chunks on
every startup alongside the BM25 index — no extra persistence required.
"""
from __future__ import annotations

import logging
import re
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

from rag.retrieval.schemas import MetadataFilter, RetrievalRequest, RetrievedChunk

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Simple entity extractor (no spaCy dependency – uses regex + stopwords)
# ---------------------------------------------------------------------------

_STOP_WORDS = frozenset({
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "of", "in", "on", "at", "to",
    "for", "with", "by", "from", "up", "about", "into", "through", "during",
    "and", "or", "but", "not", "this", "that", "these", "those", "what",
    "which", "who", "whom", "how", "when", "where", "why", "it", "its",
    "they", "them", "their", "we", "our", "i", "my", "me", "you", "your",
    "he", "she", "his", "her", "as", "if", "so", "than", "then", "each",
    "also", "more", "other", "only", "just", "any", "all", "both", "no",
    "nor", "such", "same", "after", "before", "between", "during", "while",
    "where", "there", "here", "now", "then", "get", "use", "make", "work",
    "new", "one", "two", "three", "first", "second", "next", "last", "page",
})

_MIN_ENTITY_LEN = 3
_MAX_ENTITIES_PER_CHUNK = 30


def _extract_entities(text: str) -> Set[str]:
    """
    Extract candidate entities from text using simple heuristics:
    - Words 3+ chars, not stopwords, not purely numeric.
    - Title-case words (likely proper nouns).
    - Hyphenated technical terms.
    Normalised to lowercase for graph keys.
    """
    entities: Set[str] = set()

    # 1. Title-case words (proper nouns)
    for match in re.finditer(r"\b[A-Z][a-z]{2,}\b", text):
        w = match.group().lower()
        if w not in _STOP_WORDS:
            entities.add(w)

    # 2. All-caps acronyms (MIN 2 chars)
    for match in re.finditer(r"\b[A-Z]{2,}\b", text):
        entities.add(match.group().lower())

    # 3. Hyphenated technical terms
    for match in re.finditer(r"\b[a-zA-Z]+-[a-zA-Z]+\b", text):
        w = match.group().lower()
        if len(w) >= _MIN_ENTITY_LEN:
            entities.add(w)

    # 4. Regular words that are meaningful
    for word in re.findall(r"\b[a-zA-Z]{3,}\b", text.lower()):
        if word not in _STOP_WORDS and len(word) >= _MIN_ENTITY_LEN:
            entities.add(word)

    return set(list(entities)[:_MAX_ENTITIES_PER_CHUNK])


# ---------------------------------------------------------------------------
# Graph index data structures
# ---------------------------------------------------------------------------

@dataclass
class GraphNode:
    """Represents a document chunk as a node."""
    chunk_id: str
    doc_id: int
    text: str
    entities: Set[str] = field(default_factory=set)
    doc_title: Optional[str] = None
    doc_filename: Optional[str] = None
    page_number: Optional[int] = None
    sequence_number: Optional[int] = None
    user_id: Optional[int] = None
    tags: List[str] = field(default_factory=list)
    file_type: Optional[str] = None


class GraphRetriever:
    """
    In-memory graph retriever.

    The graph has two layers:
    - **Entity → Chunks**: which chunks mention an entity.
    - **Chunk → Chunks**: edges weighted by shared entity count.

    Parameters
    ----------
    max_hops:
        Number of graph hops from seed chunks during traversal.
    min_edge_weight:
        Minimum shared-entity count for an edge to be traversable.
    """

    def __init__(
        self,
        max_hops: int = 1,
        min_edge_weight: int = 1,
    ) -> None:
        self._max_hops = max_hops
        self._min_edge_weight = min_edge_weight

        # entity → set of chunk_ids
        self._entity_index: Dict[str, Set[str]] = defaultdict(set)
        # chunk_id → GraphNode
        self._nodes: Dict[str, GraphNode] = {}
        # chunk_id → {neighbor_chunk_id: shared_entity_count}
        self._adjacency: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))

        self._is_ready = False
        self._node_count = 0
        self._edge_count = 0

    # ------------------------------------------------------------------ #
    # Properties                                                            #
    # ------------------------------------------------------------------ #

    @property
    def is_ready(self) -> bool:
        return self._is_ready

    @property
    def node_count(self) -> int:
        return self._node_count

    @property
    def edge_count(self) -> int:
        return self._edge_count

    # ------------------------------------------------------------------ #
    # Index building                                                        #
    # ------------------------------------------------------------------ #

    def build_index(self, chunks: List[Dict]) -> None:
        """
        Build entity graph from chunk dicts.

        Each dict must have at minimum: chunk_id, doc_id, text.
        Optional fields: doc_title, doc_filename, page_number,
                         sequence_number, user_id, tags, file_type.
        """
        if not chunks:
            logger.warning("GraphRetriever.build_index called with empty chunk list")
            return

        t0 = time.perf_counter()
        self._entity_index.clear()
        self._nodes.clear()
        self._adjacency.clear()
        self._is_ready = False

        # Step 1: Build nodes + entity index
        for c in chunks:
            chunk_id = str(c.get("chunk_id", ""))
            if not chunk_id:
                continue
            text = c.get("text", "")
            entities = _extract_entities(text)

            node = GraphNode(
                chunk_id=chunk_id,
                doc_id=int(c.get("doc_id", 0)),
                text=text,
                entities=entities,
                doc_title=c.get("doc_title"),
                doc_filename=c.get("doc_filename"),
                page_number=c.get("page_number"),
                sequence_number=c.get("sequence_number"),
                user_id=c.get("user_id"),
                tags=c.get("tags") or [],
                file_type=c.get("file_type"),
            )
            self._nodes[chunk_id] = node

            for entity in entities:
                self._entity_index[entity].add(chunk_id)

        # Step 2: Build adjacency (edges between chunks sharing entities)
        edges_seen: Set[Tuple[str, str]] = set()
        for entity, chunk_ids in self._entity_index.items():
            chunk_list = list(chunk_ids)
            for i, cid_a in enumerate(chunk_list):
                for cid_b in chunk_list[i + 1:]:
                    self._adjacency[cid_a][cid_b] += 1
                    self._adjacency[cid_b][cid_a] += 1
                    key = tuple(sorted((cid_a, cid_b)))
                    edges_seen.add(key)  # type: ignore[arg-type]

        self._is_ready = True
        self._node_count = len(self._nodes)
        self._edge_count = len(edges_seen)

        elapsed = (time.perf_counter() - t0) * 1000
        logger.info(
            "GraphRetriever: built index — nodes=%d entities=%d edges=%d (%.0f ms)",
            self._node_count,
            len(self._entity_index),
            self._edge_count,
            elapsed,
        )

    def add_chunks(self, chunks: List[Dict]) -> None:
        """Incrementally add chunks to an existing graph (called after ingestion)."""
        if not self._is_ready:
            self.build_index(chunks)
            return

        for c in chunks:
            chunk_id = str(c.get("chunk_id", ""))
            if not chunk_id or chunk_id in self._nodes:
                continue
            text = c.get("text", "")
            entities = _extract_entities(text)

            node = GraphNode(
                chunk_id=chunk_id,
                doc_id=int(c.get("doc_id", 0)),
                text=text,
                entities=entities,
                doc_title=c.get("doc_title"),
                doc_filename=c.get("doc_filename"),
                page_number=c.get("page_number"),
                sequence_number=c.get("sequence_number"),
                user_id=c.get("user_id"),
                tags=c.get("tags") or [],
                file_type=c.get("file_type"),
            )
            self._nodes[chunk_id] = node
            self._node_count += 1

            for entity in entities:
                # Connect to existing chunks that share this entity
                for existing_id in self._entity_index[entity]:
                    self._adjacency[chunk_id][existing_id] += 1
                    self._adjacency[existing_id][chunk_id] += 1
                    self._edge_count += 1
                self._entity_index[entity].add(chunk_id)

    # ------------------------------------------------------------------ #
    # Retrieval                                                             #
    # ------------------------------------------------------------------ #

    def retrieve(self, request: RetrievalRequest) -> List[RetrievedChunk]:
        """
        Graph-based retrieval:
        1. Extract query entities.
        2. Find seed chunks that contain those entities.
        3. BFS-expand up to max_hops.
        4. Score by entity overlap + edge weight.
        5. Apply user_id filter if present.
        6. Return top-k results.
        """
        if not self._is_ready or not self._nodes:
            logger.warning("GraphRetriever not ready or empty — returning []")
            return []

        query_entities = _extract_entities(request.query)
        if not query_entities:
            logger.debug("GraphRetriever: no entities found in query")
            return []

        # Step 1: Seed chunks (contain ≥1 query entity)
        seed_scores: Dict[str, float] = defaultdict(float)
        for entity in query_entities:
            if entity in self._entity_index:
                for chunk_id in self._entity_index[entity]:
                    seed_scores[chunk_id] += 1.0

        if not seed_scores:
            logger.debug("GraphRetriever: no seed chunks found for query entities")
            return []

        # Step 2: BFS expansion
        visited: Set[str] = set(seed_scores.keys())
        frontier: Set[str] = set(seed_scores.keys())
        hop_decay = 0.5  # score decay per hop

        for hop in range(self._max_hops):
            next_frontier: Set[str] = set()
            for cid in frontier:
                neighbors = self._adjacency.get(cid, {})
                for neighbor_id, weight in neighbors.items():
                    if neighbor_id not in visited and weight >= self._min_edge_weight:
                        # Score = hop_decay^(hop+1) * edge_weight
                        seed_scores[neighbor_id] += (hop_decay ** (hop + 1)) * weight
                        next_frontier.add(neighbor_id)
                        visited.add(neighbor_id)
            frontier = next_frontier
            if not frontier:
                break

        # Step 3: Filter by user_id if provided
        user_id = request.filters.user_id if request.filters else None
        result_chunks: List[Tuple[str, float]] = []
        for chunk_id, score in seed_scores.items():
            node = self._nodes.get(chunk_id)
            if node is None:
                continue
            if user_id is not None and node.user_id != user_id:
                continue
            result_chunks.append((chunk_id, score))

        # Step 4: Sort + top-k
        result_chunks.sort(key=lambda x: x[1], reverse=True)
        top_results = result_chunks[: request.top_k]

        # Step 5: Build RetrievedChunk objects
        retrieved: List[RetrievedChunk] = []
        for chunk_id, score in top_results:
            node = self._nodes[chunk_id]
            chunk = RetrievedChunk(
                chunk_id=chunk_id,
                doc_id=node.doc_id,
                text=node.text,
                score=round(score, 4),
                doc_title=node.doc_title,
                doc_filename=node.doc_filename,
                page_number=node.page_number,
                sequence_number=node.sequence_number,
                user_id=node.user_id,
                tags=node.tags,
                file_type=node.file_type,
                retriever_source="graph",
                graph_score=round(score, 4),
            )
            retrieved.append(chunk)

        logger.info(
            "GraphRetriever: query=%r → %d seeds → %d final chunks",
            request.query[:50],
            len(seed_scores),
            len(retrieved),
        )
        return retrieved


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_graph: Optional[GraphRetriever] = None


def get_graph() -> GraphRetriever:
    global _graph
    if _graph is None:
        _graph = GraphRetriever()
    return _graph
