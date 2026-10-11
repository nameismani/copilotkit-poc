import json
from datetime import date
from typing import Literal, Optional

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool

from common import get_llm
import money_store as store

USER = store.DEMO_USER
Kind = Literal["income", "expense"]


# ── Tools the Money sub-agent can use (backend tools -> Python dict) ──────────
@tool
async def add_transaction(kind: Kind, amount: float, category: str, note: str = "",
                          on_date: Optional[str] = None) -> dict:
    """Record a new income or expense. on_date is YYYY-MM-DD (defaults to today)."""
    return store.add_transaction(USER, kind, amount, category, note, on_date)


@tool
async def list_transactions(kind: Optional[Kind] = None, category: Optional[str] = None,
                            limit: int = 50) -> list[dict]:
    """List transactions, newest first. Optionally filter by kind or category."""
    return store.list_transactions(USER, kind, category, limit)


@tool
async def update_transaction(transaction_id: str, kind: Optional[Kind] = None,
                             amount: Optional[float] = None, category: Optional[str] = None,
                             note: Optional[str] = None, on_date: Optional[str] = None) -> dict:
    """Update an existing transaction by id. Only pass the fields that change."""
    fields = {"kind": kind, "amount": amount, "category": category, "note": note, "date": on_date}
    row = store.update_transaction(USER, transaction_id, **{k: v for k, v in fields.items() if v is not None})
    return row or {"error": f"transaction {transaction_id} not found"}


@tool
async def delete_transaction(transaction_id: str) -> dict:
    """Delete a transaction by id."""
    return {"id": transaction_id, "deleted": store.delete_transaction(USER, transaction_id)}


@tool
async def get_summary() -> dict:
    """Totals: income, expense, balance and expense per category."""
    return store.summary(USER)


MONEY_TOOLS = [add_transaction, list_transactions, update_transaction, delete_transaction, get_summary]
_BY_NAME = {t.name: t for t in MONEY_TOOLS}

MONEY_PROMPT = """You are the Money Manager, a specialist that tracks the user's income and expenses.
Today's date is {today}. Default currency is Indian rupees (₹) unless the user says otherwise.

Rules:
- Use your tools for every read or write. Never invent amounts, totals or ids.
- To edit or delete, first find the transaction id with list_transactions. If several match, say so instead of guessing.
- Use short lowercase categories (food, rent, salary, travel...).
- Answer concisely, using numbers that came from tool results only.
"""


async def run_money_agent(task: str) -> str:
    """A sub-agent is just: its own prompt + its own tools + an LLM loop."""
    model = get_llm(0.2).bind_tools(MONEY_TOOLS)
    messages = [
        SystemMessage(content=MONEY_PROMPT.format(today=date.today().isoformat())),
        HumanMessage(content=task),
    ]
    for _ in range(6):  # safety cap
        ai = await model.ainvoke(messages)
        messages.append(ai)
        if not ai.tool_calls:
            return ai.content if isinstance(ai.content, str) else str(ai.content)
        for call in ai.tool_calls:
            t = _BY_NAME.get(call["name"])
            try:
                result = await t.ainvoke(call["args"]) if t else f"Unknown tool {call['name']}"
            except Exception as e:  # keep the history valid: every call gets a result
                result = f"Error: {e}"
            messages.append(ToolMessage(
                content=result if isinstance(result, str) else json.dumps(result, default=str),
                tool_call_id=call["id"], name=call["name"],
            ))
    return "I stopped after too many steps. Please try a simpler request."


# ── The ONE tool the supervisor sees ──────────────────────────────────────────
@tool
async def ask_money_manager(task: str) -> str:
    """Delegate ANY money request to the Money Manager specialist: log income or an expense,
    edit or delete a transaction, list spending, totals, balance, category breakdown.
    Pass a complete, self-contained task with amounts, categories, dates and intent."""
    return await run_money_agent(task)