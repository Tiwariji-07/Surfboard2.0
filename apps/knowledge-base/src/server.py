"""
FastAPI server for the WaveMaker knowledge base RAG service.

Endpoints:
  POST /ingest         - Ingest/re-ingest knowledge base into ChromaDB
  POST /query          - Full RAG query (non-streaming)
  POST /query/stream   - Streaming RAG query (SSE)
  POST /search         - Direct semantic search (no LLM)
  GET  /health         - Health check
  GET  /stats          - Collection statistics
"""

import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .chunker import load_all_chunks
from .store import ingest_chunks, query_knowledge, collection_stats
from .rag import rag_query, rag_query_stream


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-ingest on startup if collection is empty
    stats = collection_stats()
    if stats["total_chunks"] == 0:
        print("Knowledge base empty, auto-ingesting...")
        chunks = load_all_chunks()
        count = ingest_chunks(chunks)
        print(f"Ingested {count} chunks on startup")
    else:
        print(f"Knowledge base loaded: {stats['total_chunks']} chunks")
    yield


app = FastAPI(
    title="Surfboard Knowledge Base",
    description="ChromaDB-backed RAG service for WaveMaker knowledge",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Request/Response Models ---


class IngestResponse(BaseModel):
    status: str
    chunks_ingested: int


class QueryRequest(BaseModel):
    query: str
    page_context: dict | None = None
    chat_history: list[dict] | None = None
    litellm_base_url: str = Field(default_factory=lambda: os.getenv("LITELLM_BASE_URL", "http://localhost:4000"))
    litellm_api_key: str = Field(default_factory=lambda: os.getenv("LITELLM_API_KEY", ""))
    intent_model: str = "claude-sonnet"
    copilot_model: str = "claude-sonnet"


class QueryResponse(BaseModel):
    answer: str
    intent: dict
    sources: list[dict]
    retrieved_count: int


class SearchRequest(BaseModel):
    query: str
    n_results: int = 5
    filter_type: str | None = None  # "api_reference", "manual", "widget_reference", "action_reference"


class SearchResponse(BaseModel):
    results: list[dict]
    count: int


# --- Endpoints ---


@app.get("/health")
async def health():
    return {"status": "ok", "service": "surfboard-knowledge-base"}


@app.get("/stats")
async def stats():
    return collection_stats()


@app.post("/ingest", response_model=IngestResponse)
async def ingest():
    """Re-ingest all knowledge base files into ChromaDB."""
    chunks = load_all_chunks()
    count = ingest_chunks(chunks)
    return IngestResponse(status="ok", chunks_ingested=count)


@app.post("/query", response_model=QueryResponse)
async def query(req: QueryRequest):
    """Full two-stage RAG query (non-streaming)."""
    try:
        result = await rag_query(
            query=req.query,
            page_context=req.page_context,
            chat_history=req.chat_history,
            litellm_base_url=req.litellm_base_url,
            litellm_api_key=req.litellm_api_key,
            intent_model=req.intent_model,
            copilot_model=req.copilot_model,
        )
        return QueryResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query/stream")
async def query_stream(req: QueryRequest):
    """Streaming two-stage RAG query (SSE format)."""

    async def event_generator():
        try:
            async for event in rag_query_stream(
                query=req.query,
                page_context=req.page_context,
                chat_history=req.chat_history,
                litellm_base_url=req.litellm_base_url,
                litellm_api_key=req.litellm_api_key,
                intent_model=req.intent_model,
                copilot_model=req.copilot_model,
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/search", response_model=SearchResponse)
async def search(req: SearchRequest):
    """Direct semantic search against ChromaDB (no LLM call)."""
    where_filter = None
    if req.filter_type:
        where_filter = {"type": req.filter_type}

    results = query_knowledge(req.query, n_results=req.n_results, where_filter=where_filter)
    return SearchResponse(results=results, count=len(results))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("KB_PORT", "8788"))
    uvicorn.run("src.server:app", host="0.0.0.0", port=port, reload=True)
