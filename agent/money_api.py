from typing import Literal, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import money_store as store

router = APIRouter(prefix="/api/money", tags=["money"])
USER = store.DEMO_USER
Kind = Literal["income", "expense"]


class NewTx(BaseModel):
    kind: Kind
    amount: float = Field(gt=0)
    category: str
    note: str = ""
    date: Optional[str] = None


class PatchTx(BaseModel):
    kind: Optional[Kind] = None
    amount: Optional[float] = Field(default=None, gt=0)
    category: Optional[str] = None
    note: Optional[str] = None
    date: Optional[str] = None


@router.get("/transactions")
def list_all():
    return store.list_transactions(USER)


@router.post("/transactions")
def create(body: NewTx):
    try:
        return store.add_transaction(USER, body.kind, body.amount, body.category, body.note, body.date)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch("/transactions/{tx_id}")
def patch(tx_id: str, body: PatchTx):
    try:
        row = store.update_transaction(USER, tx_id, **body.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not row:
        raise HTTPException(404, "not found")
    return row


@router.delete("/transactions/{tx_id}")
def delete(tx_id: str):
    return {"ok": store.delete_transaction(USER, tx_id)}


@router.get("/summary")
def get_summary():
    return store.summary(USER)