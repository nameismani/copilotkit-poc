import threading
import uuid
from datetime import date
from typing import Optional

DEMO_USER = "demo"  # TODO: real user id from auth later

_LOCK = threading.Lock()
_DB: dict[str, list[dict]] = {}  # user_id -> list of transactions


def _rows(user_id: str) -> list[dict]:
    return _DB.setdefault(user_id, [])


def _check(kind=None, amount=None, on_date=None):
    if kind is not None and kind not in ("income", "expense"):
        raise ValueError("kind must be 'income' or 'expense'")
    if amount is not None and amount <= 0:
        raise ValueError("amount must be greater than 0")
    if on_date is not None:
        date.fromisoformat(on_date)  # raises ValueError if not YYYY-MM-DD


def add_transaction(user_id, kind, amount, category, note="", on_date: Optional[str] = None) -> dict:
    _check(kind, amount, on_date)
    row = {
        "id": uuid.uuid4().hex[:8],
        "kind": kind,
        "amount": round(float(amount), 2),
        "category": (category or "other").strip().lower(),
        "note": note or "",
        "date": on_date or date.today().isoformat(),
    }
    with _LOCK:
        _rows(user_id).append(row)
    return dict(row)


def list_transactions(user_id, kind=None, category=None, limit: int = 100) -> list[dict]:
    with _LOCK:
        rows = list(reversed(_rows(user_id)))  # newest inserted first
    if kind:
        rows = [r for r in rows if r["kind"] == kind]
    if category:
        rows = [r for r in rows if r["category"] == category.strip().lower()]
    rows.sort(key=lambda r: r["date"], reverse=True)  # stable
    return [dict(r) for r in rows[:limit]]


def update_transaction(user_id, tx_id: str, **fields) -> Optional[dict]:
    _check(fields.get("kind"), fields.get("amount"), fields.get("date"))
    allowed = {"kind", "amount", "category", "note", "date"}
    with _LOCK:
        for row in _rows(user_id):
            if row["id"] == tx_id:
                for k, v in fields.items():
                    if k in allowed and v is not None:
                        row[k] = v.strip().lower() if k == "category" else v
                return dict(row)
    return None


def delete_transaction(user_id, tx_id: str) -> bool:
    with _LOCK:
        rows = _rows(user_id)
        for i, row in enumerate(rows):
            if row["id"] == tx_id:
                rows.pop(i)
                return True
    return False


def summary(user_id) -> dict:
    with _LOCK:
        rows = [dict(r) for r in _rows(user_id)]
    income = sum(r["amount"] for r in rows if r["kind"] == "income")
    expense = sum(r["amount"] for r in rows if r["kind"] == "expense")
    by_category: dict[str, float] = {}
    for r in rows:
        if r["kind"] == "expense":
            by_category[r["category"]] = round(by_category.get(r["category"], 0) + r["amount"], 2)
    return {
        "income": round(income, 2),
        "expense": round(expense, 2),
        "balance": round(income - expense, 2),
        "by_category": by_category,
    }