"""
ChromaDB vector store for WaveMaker knowledge base.

Uses LiteLLM proxy for embeddings (OpenAI-compatible /v1/embeddings endpoint).
This avoids heavy local dependencies like sentence-transformers + torch.
"""

import os
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import httpx
import chromadb
from chromadb import EmbeddingFunction, Documents, Embeddings
from chromadb.config import Settings

CHROMA_DIR = Path(__file__).resolve().parent.parent / "chroma_data"
COLLECTION_NAME = "wavemaker_knowledge"

# LiteLLM embedding config - reads from env or uses defaults
LITELLM_BASE_URL = os.getenv("LITELLM_BASE_URL", "http://localhost:4000")
LITELLM_API_KEY = os.getenv("LITELLM_API_KEY", "")
LITELLM_EMBEDDING_MODEL = os.getenv("LITELLM_EMBEDDING_MODEL", "text-embedding-3-small")


class LiteLLMEmbeddingFunction(EmbeddingFunction):
    """ChromaDB embedding function that calls LiteLLM's /v1/embeddings endpoint."""

    def __init__(self, base_url: str, api_key: str, model: str):
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model

    def __call__(self, input: Documents) -> Embeddings:
        url = f"{self._base_url}/v1/embeddings"
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        # LiteLLM supports batched embedding requests
        response = httpx.post(
            url,
            headers=headers,
            json={"model": self._model, "input": input},
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()

        # Sort by index to ensure correct ordering
        embeddings_data = sorted(data["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in embeddings_data]


_client: chromadb.ClientAPI | None = None
_collection: chromadb.Collection | None = None


def get_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path=str(CHROMA_DIR),
            settings=Settings(anonymized_telemetry=False),
        )
    return _client


def get_embedding_function() -> LiteLLMEmbeddingFunction:
    return LiteLLMEmbeddingFunction(
        base_url=LITELLM_BASE_URL,
        api_key=LITELLM_API_KEY,
        model=LITELLM_EMBEDDING_MODEL,
    )


def get_collection() -> chromadb.Collection:
    """Get or create the main knowledge collection with LiteLLM embeddings."""
    global _collection
    if _collection is None:
        client = get_client()
        _collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=get_embedding_function(),
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def ingest_chunks(chunks: list[dict], batch_size: int = 20) -> int:
    """Ingest chunks into ChromaDB. Returns number of chunks ingested.

    Uses smaller batch_size (20) to avoid overwhelming the embedding API.
    """
    collection = get_collection()

    # Clear existing data for clean re-ingestion
    existing = collection.count()
    if existing > 0:
        all_ids = collection.get()["ids"]
        if all_ids:
            collection.delete(ids=all_ids)

    total = 0
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        ids = [c["id"] for c in batch]
        documents = [c["text"] for c in batch]
        metadatas = [c["metadata"] for c in batch]

        collection.add(ids=ids, documents=documents, metadatas=metadatas)
        total += len(batch)
        print(f"  Ingested {total}/{len(chunks)} chunks...")

    return total


def query_knowledge(
    query_text: str,
    n_results: int = 5,
    where_filter: dict | None = None,
) -> list[dict]:
    """Query the knowledge base. Returns ranked results with text, metadata, and distance."""
    collection = get_collection()

    kwargs = {
        "query_texts": [query_text],
        "n_results": n_results,
        "include": ["documents", "metadatas", "distances"],
    }
    if where_filter:
        kwargs["where"] = where_filter

    results = collection.query(**kwargs)

    items = []
    for i in range(len(results["ids"][0])):
        items.append({
            "id": results["ids"][0][i],
            "text": results["documents"][0][i],
            "metadata": results["metadatas"][0][i],
            "distance": results["distances"][0][i],
        })
    return items


def get_by_widget_keys(keys: list[str]) -> list[dict]:
    """Retrieve chunks by exact widget/variable keys (for stage-2 RAG lookup)."""
    collection = get_collection()

    # Try fetching by ID pattern (api_{key})
    target_ids = [f"api_{k}" for k in keys]
    try:
        results = collection.get(ids=target_ids, include=["documents", "metadatas"])
    except Exception:
        results = {"ids": [], "documents": [], "metadatas": []}

    items = []
    for i in range(len(results["ids"])):
        items.append({
            "id": results["ids"][i],
            "text": results["documents"][i],
            "metadata": results["metadatas"][i],
        })

    # Also try semantic search for any keys not found by ID
    found_keys = {item["id"].replace("api_", "") for item in items}
    missing_keys = [k for k in keys if k not in found_keys]

    if missing_keys:
        for key in missing_keys:
            semantic_results = query_knowledge(key, n_results=2, where_filter={"type": "api_reference"})
            items.extend(semantic_results)

    return items


def collection_stats() -> dict:
    """Get stats about the current collection."""
    collection = get_collection()
    count = collection.count()
    return {
        "collection": COLLECTION_NAME,
        "total_chunks": count,
        "embedding_model": LITELLM_EMBEDDING_MODEL,
        "litellm_base_url": LITELLM_BASE_URL,
        "chroma_dir": str(CHROMA_DIR),
    }
