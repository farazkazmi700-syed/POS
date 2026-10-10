"""Phase 2 - AI chatbot service (placeholder).

Plan: RAG over the tenant's products + sales (Qdrant) with LLaMA 3 (Ollama) or an OpenAI-compatible API.
Every retrieval MUST be filtered by tenantId, exactly like the main API.

Run:  uvicorn app.main:app --reload --port 8100
"""
from fastapi import FastAPI

app = FastAPI(title="POS Chatbot Service", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
