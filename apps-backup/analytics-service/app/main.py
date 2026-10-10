"""Phase 2 - AI analytics service (placeholder).

Planned endpoints (called internally by the NestJS API):
  GET  /health
  POST /forecast/demand        -> demand forecast per product
  POST /anomalies/orders       -> unusual voids / discounts
  POST /recommendations/restock

Run:  uvicorn app.main:app --reload --port 8000
"""
from fastapi import FastAPI

app = FastAPI(title="POS Analytics Service", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
