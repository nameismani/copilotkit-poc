# CopilotKit + AG-UI POC: Todo (browser tools) + Money Manager (backend sub-agent)

> **Who this is for:** a developer or an AI agent who must understand, run, debug or extend this project, and who wants to learn CopilotKit along the way.
> **Last updated:** 2026-10-11. This file supersedes the earlier `COPILOTKIT_POC_HANDOFF.md` (it described a single agent, a `web/` folder and the 8B model).
> **Golden rule:** CopilotKit changes its API often. Before trusting any import in this file, check https://docs.copilotkit.ai. Several answers during this project were first written from memory, were wrong, and had to be corrected (section 10 lists them).

---

## 0. Status at a glance

| Area                                                                                  | State                                                                                                    |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Self-hosted runtime (Next.js) + FastAPI + LangGraph + Groq                            | **Working** (user confirmed on 2026-10-11 after fixing two 404s, section 10)                             |
| Custom chat UI (no `<CopilotChat>`), 70/30 layout, scrollable messages                | **Working**                                                                                              |
| Todo CRUD through the agent (browser tools, React state)                              | **Working**                                                                                              |
| Money manager through the agent (backend sub-agent, Python dict) + REST + React Query | **Working**                                                                                              |
| Separate pages (`/` todos, `/money`) with one shared chat in the layout               | Implemented. Refactor to `AppShell` **not yet confirmed by the user**                                    |
| `useMoney` refetch driven by `useAgent` run status (+ optional polling)               | Implemented, **not yet confirmed**. The `UseAgentUpdate` import is unverified                            |
| Mixed requests in one message ("add a todo and log an expense")                       | **Untested** (riskiest path, section 11)                                                                 |
| CopilotKit Cloud (phase 2)                                                            | **Not started and not researched**                                                                       |
| Real database                                                                         | **Not implemented.** Money uses an in-memory Python dict. A commented MongoDB design exists (section 12) |

---

## 1. Goal and decisions

**Goal:** a proof of concept of CopilotKit with the AG-UI protocol on a small app, first self-hosted, later with CopilotKit Cloud.

| Decision            | Choice                                                                                                       | Reason                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Frontend            | Next.js App Router, TypeScript, Tailwind. Folder name **`frontend`**                                         | user preference                                                           |
| Backend             | FastAPI + LangGraph. Folder **`agent`**                                                                      | user preference                                                           |
| LLM                 | Groq Cloud, **`openai/gpt-oss-120b`** (override with env `GROQ_MODEL`)                                       | small 8B models were unreliable at tool calling                           |
| Chat UI             | **Custom chat built by hand.** Never use `<CopilotChat>`, `<CopilotSidebar>` or `<CopilotPopup>`             | explicit user requirement                                                 |
| Layout              | Every page is 70% content / 30% chat, chat fixed on the right, only the message list scrolls                 | user requirement                                                          |
| Chat placement      | **One** chat in the root layout (`AppShell`), never inside a page                                            | user requirement: "I don't want a chatbot differently for separate pages" |
| Pages               | `/` = Todos, `/money` = Money. **Separate pages, not tabs**                                                  | user feedback (corrected after a first wrong attempt with tabs)           |
| Agents              | **One** frontend `agentId`: `main_assistant`. The backend decides who handles a request (supervisor pattern) | user asked for backend-decided routing                                    |
| Todo data           | **Frontend tools**, in-browser React state (lost on full page refresh)                                       | user choice: the agent drives the UI                                      |
| Money data          | **Backend tools** + Python `dict` in memory (lost on server restart) + REST API for the UI                   | user choice: in-memory dict, backend operations                           |
| Data fetching in UI | `@tanstack/react-query`                                                                                      | user choice                                                               |
| Database            | none yet. MongoDB example kept commented                                                                     | user: "not going to implement now"                                        |

---

## 2. Stack and installs

```powershell
# agent (Python 3.12 venv)
pip install -U fastapi uvicorn python-dotenv copilotkit ag-ui-langgraph langgraph langchain-groq

# frontend
npm i @copilotkit/react-core@latest @copilotkit/runtime@latest @ag-ui/client@latest zod @tanstack/react-query
npm i -D @tanstack/react-query-devtools        # optional
```

- `@copilotkit/runtime-client-gql` was installed early on for the v1 API (`TextMessage`, `Role`). **It is no longer needed**, so remove it if nothing imports it.
- Keep all `@copilotkit/*` packages on the same version.
- Windows + PowerShell is the user's environment. Use PowerShell syntax in any command you give. `[` and `]` in paths need `-LiteralPath`.

Environment files:

```
agent/.env
  GROQ_API_KEY=...
  GROQ_MODEL=openai/gpt-oss-120b      # optional
  FRONTEND_ORIGIN=http://localhost:3000   # optional (CORS)
  PORT=8000                            # optional
  RELOAD=1                             # optional, see section 11 (wipes the in-memory money data on every file save)

frontend/.env.local
  AGENT_BASE_URL=http://localhost:8000        # NO trailing path. Used server-side by the runtime route
  NEXT_PUBLIC_API_URL=http://localhost:8000   # used by the browser for the money REST API
```

Run (two terminals, **restart the Python server by hand after every Python change**, auto-reload is off on purpose):

```powershell
# Terminal 1
cd agent; .\.venv\Scripts\Activate.ps1; python main.py
# Terminal 2
cd frontend; npm run dev
```

---

## 3. Architecture

```
Browser (Next.js, React)
  ├─ AppShell (root layout): nav + ONE ChatPanel (30%) + current page (70%)
  ├─ TodosProvider keeps todo state alive across pages
  ├─ "/"       useTodos(): registers 4 browser tools + todo context   (only while this page is mounted)
  └─ "/money"  MoneyPanel: React Query  ⇄  REST /api/money/*   (same Python dict the agent uses)
        │ chat messages
        ▼
Next.js runtime route  /api/copilotkit/[[...slug]]   (CopilotRuntime v2, multi-route)
        │ AG-UI over HTTP (SSE)  → agentId "main_assistant"
        ▼
FastAPI  POST /copilotkit/main   (ag-ui-langgraph + LangGraphAGUIAgent)
        ▼
LangGraph supervisor graph
  ├─ supervisor node (Groq gpt-oss-120b, sees browser tools + ask_money_manager)
  ├─ conditional route:  backend tool call → "tools" node → back to supervisor
  │                      only browser tool calls → END (browser executes, new run follows)
  └─ ask_money_manager(task) → Money sub-agent (own prompt, 5 tools, own LLM loop)
                                  └─ money_store.py  (module-level dict, thread lock)
```

### 3.1 Three request flows

**A. Todo request ("add todo buy milk"), browser tool**

```
Run 1: supervisor emits tool_call add_todo → route() sees only browser tools → END (run ends)
Browser: useFrontendTool handler runs → React state updates → result sent back as a tool message
Run 2: supervisor reads the result → "Added buy milk."
```

**B. Money request ("spent 250 on lunch"), backend sub-agent**

```
One run: supervisor emits ask_money_manager(task)
  → tools_node runs it → run_money_agent loops LLM + tools (add_transaction …) against the dict
  → ToolMessage → supervisor writes the final answer
UI: when the run ends (and optionally while it runs) useMoney refetches GET /api/money/*
```

**C. Question about todos ("how many todos do I have?")**
No tool. The todo list reaches the agent through `useAgentContext`, and the supervisor prompt says to answer from that context.

### 3.2 Why the supervisor graph has its own `route` and `tools_node`

A normal LangGraph tool node cannot run a tool that only exists in the browser. Two rules apply:

1. Every `tool_call` in a model message must get a result before the model is called again, or the model API rejects the request.
2. Browser tools must **end the run** so CopilotKit can execute them client-side.

So `route()` sends a message to `tools` if it contains any backend tool call, and to `END` otherwise. `tools_node` answers backend calls and gives any browser call found in the same message a "not executed" result, so no call is left unanswered. The supervisor prompt and `parallel_tool_calls=False` ask the model to make one tool call per step so such mixed messages should not occur.

### 3.3 Context is a snapshot

`useAgentContext` is sent when a run **starts**. Data changed by a backend tool during the run is not reflected in it. That is why the agent must use a tool (`list_transactions`, `get_summary`) for money data instead of trusting context.

---

## 4. Project structure

```
copilotkit-poc/
├─ README.md
├─ agent/
│  ├─ .env
│  ├─ common.py          # get_llm, context_text, frontend_tools, tool_names
│  ├─ money_store.py     # in-memory "database" (dict + lock)
│  ├─ money_agent.py     # Money sub-agent + ask_money_manager tool
│  ├─ money_api.py       # REST endpoints for the UI (/api/money/*)
│  ├─ graph_main.py      # supervisor graph (LangGraph)
│  └─ main.py            # FastAPI app, CORS, routers, AG-UI endpoint
└─ frontend/
   ├─ .env.local
   └─ app/
      ├─ layout.tsx
      ├─ providers.tsx                       # QueryClient + CopilotKit + TodosProvider
      ├─ page.tsx                            # "/" Todos (content only)
      ├─ money/page.tsx                      # "/money" Money (content only)
      ├─ api/copilotkit/[[...slug]]/route.ts # self-hosted v2 runtime (folder name is EXACT)
      ├─ components/
      │  ├─ AppShell.tsx                     # 70/30 grid, nav, the single ChatPanel
      │  ├─ ChatPanel.tsx                    # custom chat using useAgent
      │  ├─ TodoPanel.tsx                    # presentational: todo list UI
      │  └─ MoneyPanel.tsx                   # presentational: money UI, uses useMoney
      ├─ hooks/
      │  ├─ useTodos.ts                      # browser tools + context (v2)
      │  └─ useMoney.ts                      # React Query + refresh on agent run
      ├─ lib/moneyApi.ts                     # fetch wrapper for /api/money/*
      └─ providers/TodosProvider.tsx         # todo state that survives navigation
```

**Path-alias note:** the user's repo imports `@/lib/moneyApi` and `@/proivders/TodosProvider` (the folder is spelled `proivders`, a typo that works as long as every import matches). `@/` is whatever `tsconfig.json` `paths` maps it to. Check it before moving files, and consider renaming the folder to `providers`.

**Deleted along the way:** `agent/graph.py` (replaced by `graph_main.py`), `frontend/app/components/CustomChat.tsx` (replaced by `ChatPanel`), `components/SplitLayout.tsx` (replaced by `AppShell`), `frontend/app/api/copilotkit/route.ts` (the old single-route file must not exist next to `[[...slug]]`).

---

## 5. Backend code (final)

### `agent/common.py`

```python
import os
from langchain_groq import ChatGroq
from copilotkit import CopilotKitState


def get_llm(temperature: float = 0.3) -> ChatGroq:
    return ChatGroq(model=os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"), temperature=temperature)


def context_text(state: CopilotKitState) -> str:
    """App context from the frontend (useAgentContext) as prompt text."""
    ctx = (state.get("copilotkit") or {}).get("context") or []
    parts = []
    for item in ctx:
        if isinstance(item, dict):
            desc, val = item.get("description", ""), item.get("value", "")
        else:
            desc, val = getattr(item, "description", ""), getattr(item, "value", "")
        parts.append(f"{desc}:\n{val}")
    return "\n\n".join(parts) if parts else "(no app context provided)"


def frontend_tools(state: CopilotKitState) -> list:
    return (state.get("copilotkit") or {}).get("actions") or state.get("tools") or []


def tool_names(tools: list) -> list[str]:
    return [t.get("name") or t.get("function", {}).get("name") for t in tools if isinstance(t, dict)]
```

### `agent/money_store.py` (the in-memory "database")

```python
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
```

### `agent/money_agent.py` (the sub-agent)

A sub-agent is simply: its own prompt + its own tools + an LLM loop. The supervisor only sees the string it returns.

```python
import json
from datetime import date
from typing import Literal, Optional

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool

from common import get_llm
import money_store as store

USER = store.DEMO_USER
Kind = Literal["income", "expense"]


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


@tool
async def ask_money_manager(task: str) -> str:
    """Delegate ANY money request to the Money Manager specialist: log income or an expense,
    edit or delete a transaction, list spending, totals, balance, category breakdown.
    Pass a complete, self-contained task with amounts, categories, dates and intent."""
    return await run_money_agent(task)
```

### `agent/money_api.py` (REST for the UI, same store)

```python
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
```

### `agent/graph_main.py` (the supervisor)

```python
from typing import Any
from datetime import date

from langchain_core.messages import SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph, END
from copilotkit import CopilotKitState

from common import get_llm, context_text, frontend_tools, tool_names
from money_agent import ask_money_manager

# Backend tools run here in Python. Anything else the model calls is a BROWSER tool.
BACKEND_TOOLS = {ask_money_manager.name: ask_money_manager}


class MainState(CopilotKitState):
    pass


async def supervisor(state: MainState, config: RunnableConfig) -> dict[str, Any]:
    ui_tools = frontend_tools(state)
    names = tool_names(ui_tools)
    print("[supervisor] browser tools:", names)
    has_todo_tools = "add_todo" in names

    if has_todo_tools:
        todo_section = """1) TODO LIST (lives in the user's browser)
   - Change it only with the browser tools: add_todo, edit_todo, delete_todo, toggle_todo.
   - Questions about the todo list (count, which are done) are answered from the APP CONTEXT below. No tool needed.
   - Take todo ids from the context. Never invent ids."""
    else:
        todo_section = """1) TODO LIST: NOT available on the page the user is on right now.
   - If they ask to add, edit, delete or complete todos, or ask about their todos, tell them to open the
     Todos page (the home page) and ask there. Never pretend to have changed or seen the todo list."""

    # parallel_tool_calls=False -> at most ONE tool call per model step, so a message never mixes
    # a browser tool with a backend tool. If Groq rejects this argument, delete it.
    model = get_llm().bind_tools([*ui_tools, *BACKEND_TOOLS.values()], parallel_tool_calls=False)

    system = SystemMessage(content=f"""You are a friendly assistant for an app with two areas. Today is {date.today().isoformat()}.

{todo_section}

2) MONEY (income, expenses, balance, spending). Works from any page.
   - For ANY money request call ask_money_manager with a complete, self-contained task.
   - Never answer money data from memory. Relay the specialist's numbers accurately.

Rules:
- Make ONE tool call per step. If the user asks for both areas, do the money part first, wait for its result, then do the todo part (only if todo tools exist).
- Before your final reply, check that EVERY part of the user's request was handled.
- Other questions: just chat normally. After tools finish, confirm briefly.

=== APP CONTEXT (live from the UI) ===
{context_text(state)}
""")
    response = await model.ainvoke([system, *state["messages"]], config)
    return {"messages": [response]}


async def tools_node(state: MainState) -> dict[str, Any]:
    """Runs backend tool calls. Browser calls found in the same message get a 'skipped' result
    so every tool_call has an answer (the model re-issues them alone in the next step)."""
    out = []
    for call in state["messages"][-1].tool_calls:
        tool = BACKEND_TOOLS.get(call["name"])
        if tool:
            try:
                content = str(await tool.ainvoke(call["args"]))
            except Exception as e:
                content = f"Error: {e}"
        else:
            content = "Not executed: call UI tools alone, in a separate step after backend tools finish."
        out.append(ToolMessage(content=content, tool_call_id=call["id"], name=call["name"]))
    return {"messages": out}


def route(state: MainState):
    calls = getattr(state["messages"][-1], "tool_calls", None) or []
    if not calls:
        return END
    if any(c["name"] in BACKEND_TOOLS for c in calls):
        return "tools"   # run backend work, then come back to the supervisor
    return END           # only browser tools: end the run so the browser executes them


workflow = StateGraph(MainState)
workflow.add_node("supervisor", supervisor)
workflow.add_node("tools", tools_node)
workflow.set_entry_point("supervisor")
workflow.add_conditional_edges("supervisor", route, {"tools": "tools", END: END})
workflow.add_edge("tools", "supervisor")

main_graph = workflow.compile(checkpointer=MemorySaver())
```

### `agent/main.py`

```python
import os
from dotenv import load_dotenv
load_dotenv()

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from copilotkit import LangGraphAGUIAgent

from graph_main import main_graph
from money_api import router as money_router

app = FastAPI()

# Browser calls the REST API directly (React Query), so allow the Next.js origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(money_router)

add_langgraph_fastapi_endpoint(
    app=app,
    agent=LangGraphAGUIAgent(
        name="main_assistant",
        description="Supervisor: todo list (browser tools) + money manager (sub-agent).",
        graph=main_graph,
    ),
    path="/copilotkit/main",
)

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    # reload=False on purpose: auto-reload restarts the process and WIPES the in-memory dict
    # every time you save a .py file. Use RELOAD=1 only when you accept that.
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")),
                reload=os.getenv("RELOAD") == "1")
```

---

## 6. Frontend code (final)

### `app/api/copilotkit/[[...slug]]/route.ts` (self-hosted v2 runtime)

Folder name is exactly `[[...slug]]`. Import from `/v2`, never from the package root.

```ts
import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";
import { HttpAgent } from "@ag-ui/client";

const base = process.env.AGENT_BASE_URL!; // http://localhost:8000

const runtime = new CopilotRuntime({
  agents: {
    // The KEY is the agentId the frontend asks for. It is the only routing name.
    main_assistant: new HttpAgent({ url: `${base}/copilotkit/main` }),
  },
  runner: new InMemoryAgentRunner(),
});

const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
});

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
```

### `app/providers.tsx`

```tsx
"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CopilotKit } from "@copilotkit/react-core/v2";
import { TodosProvider } from "@/proivders/TodosProvider"; // user's folder spelling; fix to "providers" if renamed

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          /* queries: { staleTime: 5_000, refetchOnWindowFocus: false } */
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <CopilotKit
        runtimeUrl="/api/copilotkit"
        agent="main_assistant"
        useSingleEndpoint={false}
      >
        <TodosProvider>{children}</TodosProvider>
      </CopilotKit>
    </QueryClientProvider>
  );
}
```

`useSingleEndpoint={false}` must match the multi-route handler. If you ever turn `staleTime` on, add `refetchOnMount: "always"` to the money queries, or a quick page switch shows stale data.

### `app/layout.tsx`

```tsx
import "./globals.css";
import { Suspense } from "react";
import Providers from "./providers";
import AppShell from "./components/AppShell";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </Suspense>
      </body>
    </html>
  );
}
```

The provider lives in a separate `"use client"` file wrapped in `<Suspense>` because putting `<CopilotKit>` directly in the layout triggered a Next.js "blocking route / randomUUID during prerender" error. If it returns, make `RootLayout` `async` and `await connection()` (from `next/server`).

### `app/components/AppShell.tsx` (70/30 + nav + the one chat)

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAgentContext } from "@copilotkit/react-core/v2";
import ChatPanel from "./ChatPanel";

const LINKS = [
  { href: "/", label: "Todos" },
  { href: "/money", label: "Money" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Tell the agent which page the user is on (one place for every page)
  useAgentContext({
    description: "The page the user is currently on.",
    value:
      pathname === "/"
        ? "Todos page. The todo tools are available here."
        : "Money page. The todo list is not available here.",
  });

  return (
    <div className="grid h-screen grid-cols-[7fr_3fr] overflow-hidden">
      {/* 70%: the current page */}
      <main className="min-h-0 min-w-0 overflow-y-auto p-6">
        <nav className="mb-6 flex gap-2 border-b">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-4 py-2 text-sm font-medium ${
                pathname === l.href
                  ? "border-b-2 border-black"
                  : "text-gray-500 hover:text-black"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        {children}
      </main>

      {/* 30%: ONE chat for the whole app, mounted once, never remounts on navigation */}
      <aside className="min-h-0 min-w-0 border-l bg-white">
        <ChatPanel
          agentId="main_assistant"
          title="Assistant"
          placeholder='Try: "add todo buy milk" or "spent 250 on lunch"'
        />
      </aside>
    </div>
  );
}
```

To add a page: create `app/<name>/page.tsx` with content only, and add one entry to `LINKS`. Never render a chat inside a page.

### `app/components/ChatPanel.tsx` (custom headless chat)

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";

type Props = {
  agentId: string;
  title: string;
  placeholder?: string;
  onRunFinished?: () => void; // optional, fires when a run goes running -> idle (currently unused)
};

export default function ChatPanel({
  agentId,
  title,
  placeholder,
  onRunFinished,
}: Props) {
  const { agent } = useAgent({ agentId });
  const { copilotkit } = useCopilotKit();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const wasRunning = useRef(false);

  const messages: any[] = agent.messages ?? [];
  const last = messages[messages.length - 1];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [
    messages.length,
    typeof last?.content === "string" ? last.content.length : 0,
    agent.isRunning,
  ]);

  useEffect(() => {
    if (wasRunning.current && !agent.isRunning) onRunFinished?.();
    wasRunning.current = agent.isRunning;
  }, [agent.isRunning]);

  const send = async () => {
    const text = input.trim();
    if (!text || agent.isRunning) return;
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content: text });
    setInput("");
    try {
      await copilotkit.runAgent({ agent });
    } catch (err) {
      console.error(`[${agentId}] runAgent failed`, err);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-gray-500">agent: {agentId}</p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400">
            {placeholder ?? "Ask me anything…"}
          </p>
        )}
        {messages.map((m) => {
          if (m.role === "user" && typeof m.content === "string") {
            return (
              <div
                key={m.id}
                className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
              >
                {m.content}
              </div>
            );
          }
          if (m.role === "assistant") {
            const calls: any[] = m.toolCalls ?? [];
            return (
              <div key={m.id} className="space-y-1">
                {calls.map((c) => (
                  <div key={c.id} className="text-xs text-gray-500">
                    ⚙ {c.function?.name}
                  </div>
                ))}
                {m.content && (
                  <div className="w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900">
                    {m.content}
                  </div>
                )}
              </div>
            );
          }
          return null; // tool results are not shown
        })}
        {agent.isRunning && (
          <div className="text-xs text-gray-400">Thinking…</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t p-3">
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type a message…"
            disabled={agent.isRunning}
          />
          <button
            onClick={send}
            disabled={agent.isRunning}
            className="rounded bg-blue-600 px-4 text-sm text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

Layout trick for "only messages scroll": the panel is `flex h-full min-h-0 flex-col`, the header and input are `shrink-0`, the message area is `min-h-0 flex-1 overflow-y-auto`. Without `min-h-0` on every flex/grid ancestor the whole page scrolls instead.

### `app/providers/TodosProvider.tsx` (todo state survives navigation)

```tsx
"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type Todo = { id: string; text: string; completed: boolean };

type Store = {
  todos: Todo[];
  add: (text: string) => string;
  edit: (id: string, text: string) => void;
  remove: (id: string) => void;
  toggle: (id: string, completed?: boolean) => void;
};

const Ctx = createContext<Store | null>(null);

export function TodosProvider({ children }: { children: React.ReactNode }) {
  const [todos, setTodos] = useState<Todo[]>([]);

  const add = useCallback((text: string) => {
    const id = crypto.randomUUID();
    setTodos((p) => [...p, { id, text, completed: false }]);
    return id;
  }, []);
  const edit = useCallback(
    (id: string, text: string) =>
      setTodos((p) => p.map((t) => (t.id === id ? { ...t, text } : t))),
    [],
  );
  const remove = useCallback(
    (id: string) => setTodos((p) => p.filter((t) => t.id !== id)),
    [],
  );
  const toggle = useCallback(
    (id: string, completed?: boolean) =>
      setTodos((p) =>
        p.map((t) =>
          t.id === id ? { ...t, completed: completed ?? !t.completed } : t,
        ),
      ),
    [],
  );

  const value = useMemo(
    () => ({ todos, add, edit, remove, toggle }),
    [todos, add, edit, remove, toggle],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTodoStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useTodoStore must be used inside <TodosProvider>");
  return s;
}
```

### `app/hooks/useTodos.ts` (browser tools; call ONLY on the Todos page)

```ts
"use client";
import { useFrontendTool, useAgentContext } from "@copilotkit/react-core/v2";
import { z } from "zod";
import { useTodoStore, type Todo } from "../providers/TodosProvider";

export type { Todo };

// Registers the browser tools for the agent and removes them when the page unmounts.
export function useTodos() {
  const store = useTodoStore();
  const { todos, add, edit, remove, toggle } = store;

  useAgentContext({
    description:
      "The user's current todo list. Each item has id, text, completed (true = done). Total count is included.",
    value: {
      total: todos.length,
      completedCount: todos.filter((t) => t.completed).length,
      todos,
    },
  });

  useFrontendTool({
    name: "add_todo",
    description: "Add a new todo task to the list",
    parameters: z.object({ text: z.string().describe("The task text") }),
    handler: async ({ text }) => ({ status: "added", id: add(text), text }),
  });

  useFrontendTool({
    name: "edit_todo",
    description: "Change the text of an existing todo, found by its id",
    parameters: z.object({
      id: z.string().describe("Id of the todo"),
      text: z.string().describe("The new text"),
    }),
    handler: async ({ id, text }) => {
      edit(id, text);
      return { status: "updated", id, text };
    },
  });

  useFrontendTool({
    name: "delete_todo",
    description: "Delete a todo by its id",
    parameters: z.object({ id: z.string().describe("Id of the todo") }),
    handler: async ({ id }) => {
      remove(id);
      return { status: "deleted", id };
    },
  });

  useFrontendTool({
    name: "toggle_todo",
    description: "Mark a todo as completed or not completed",
    parameters: z.object({
      id: z.string().describe("Id of the todo"),
      completed: z
        .boolean()
        .describe("true = completed, false = not completed"),
    }),
    handler: async ({ id, completed }) => {
      toggle(id, completed);
      return { status: "toggled", id, completed };
    },
  });

  return store;
}
```

### `app/lib/moneyApi.ts`

```ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Kind = "income" | "expense";
export type Tx = {
  id: string;
  kind: Kind;
  amount: number;
  category: string;
  note: string;
  date: string;
};
export type Summary = {
  income: number;
  expense: number;
  balance: number;
  by_category: Record<string, number>;
};

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/money${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export const moneyApi = {
  list: () => http<Tx[]>("/transactions"),
  summary: () => http<Summary>("/summary"),
  add: (b: { kind: Kind; amount: number; category: string; note?: string }) =>
    http<Tx>("/transactions", { method: "POST", body: JSON.stringify(b) }),
  update: (id: string, patch: Partial<Omit<Tx, "id">>) =>
    http<Tx>(`/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  remove: (id: string) =>
    http<{ ok: boolean }>(`/transactions/${id}`, { method: "DELETE" }),
};
```

### `app/hooks/useMoney.ts` (React Query + refresh driven by the agent run)

```ts
"use client";
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2"; // UseAgentUpdate import UNVERIFIED
import { moneyApi, type Tx } from "../lib/moneyApi";

export const MONEY_KEY = ["money"] as const;

export function useMoney() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: MONEY_KEY });

  // Re-render only when the run status changes, not on every streamed token
  const { agent } = useAgent({
    agentId: "main_assistant",
    updates: [UseAgentUpdate.OnRunStatusChanged],
  });
  const isRunning = agent.isRunning;

  // Refetch once when a run finishes (running -> idle)
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !isRunning) refresh();
    wasRunning.current = isRunning;
  }, [isRunning]);

  // Optional: poll every second only while the agent is running (live rows). Remove both
  // refetchInterval lines to refresh only at the end of the run.
  const poll = isRunning ? 1000 : false;

  const transactions = useQuery({
    queryKey: [...MONEY_KEY, "transactions"],
    queryFn: moneyApi.list,
    refetchInterval: poll,
  });
  const summary = useQuery({
    queryKey: [...MONEY_KEY, "summary"],
    queryFn: moneyApi.summary,
    refetchInterval: poll,
  });

  const add = useMutation({ mutationFn: moneyApi.add, onSuccess: refresh });
  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Omit<Tx, "id">>;
    }) => moneyApi.update(id, patch),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: moneyApi.remove,
    onSuccess: refresh,
  });

  return { transactions, summary, add, update, remove };
}
```

Because `useMoney` is only mounted on `/money`, nothing refetches while you are on `/`. The queries refetch when you open `/money`. If the Money page never refreshes after a run, drop the `updates` option so `isRunning` updates on every change.

### `app/page.tsx` (Todos) and `app/money/page.tsx` (Money): content only

```tsx
// app/page.tsx
"use client";
import { useTodos } from "./hooks/useTodos";
import TodoPanel from "./components/TodoPanel";

export default function TodosPage() {
  const todos = useTodos(); // registers the browser todo tools while this page is mounted
  return (
    <>
      <h1 className="mb-4 text-xl font-bold">Todos</h1>
      <TodoPanel {...todos} />
    </>
  );
}
```

```tsx
// app/money/page.tsx
"use client";
import MoneyPanel from "../components/MoneyPanel";

export default function MoneyPage() {
  return (
    <>
      <h1 className="mb-4 text-xl font-bold">Money</h1>
      <MoneyPanel />
    </>
  );
}
```

### Presentational components (see the repo for the code)

| File                        | Contract                                                                                                                                                                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/TodoPanel.tsx`  | props `{ todos, add, edit, remove, toggle }` (the object returned by `useTodos()`). Add form, checkbox, inline text edit, delete button                                                                                                                                                 |
| `components/MoneyPanel.tsx` | no props. Calls `useMoney()`. Shows income / expense / balance cards, category chips, an add form, and rows with inline edit (amount, category, note) and delete. Rows use a composite `key` so `defaultValue` inputs reset after a server update. Imports `Kind` from `@/lib/moneyApi` |

---

## 7. Concepts you need (learning section)

### 7.1 The three layers

- **AG-UI** is an open protocol: a stream of typed events (text, tool calls, state) between an agent and a UI. CopilotKit's frontend is an AG-UI client.
- **Copilot Runtime** sits between the browser and the agent: routing by agent name, auth, middleware. The browser never calls FastAPI for chat. (It does call FastAPI directly for the money REST API, hence CORS.)
- **Agent name** = the key in the runtime's `agents` map. It is the only name the frontend can ask for. The Python `name=` is informational.

### 7.2 Frontend tools vs backend tools

|                   | Frontend tool                                                                  | Backend tool                                       |
| ----------------- | ------------------------------------------------------------------------------ | -------------------------------------------------- |
| Declared in       | React (`useFrontendTool`, zod schema)                                          | Python (`@tool`)                                   |
| Runs in           | the browser                                                                    | the FastAPI process                                |
| Can touch         | React state, DOM, localStorage                                                 | DB, secrets, other APIs                            |
| Run lifecycle     | run ends at the tool call → browser runs handler → **new run** with the result | **same run**: ToolNode → ToolMessage → model again |
| Lifetime          | registered on mount, removed on unmount (page-scoped)                          | always available                                   |
| Needs an open tab | yes                                                                            | no                                                 |
| Trust             | tamperable by the user                                                         | server-enforced                                    |
| Used here for     | **todos**                                                                      | **money**                                          |

**Conflicts to be aware of when mixing them:** graph routing (section 3.2), orphaned tool calls, two sources of truth (React state vs server store), stale context (3.3), name collisions, auth, and the fact that **sub-agents cannot call browser tools** (in the docs' pattern the supervisor handles frontend-tool injection and sub-agents are isolated, returning only a string).

**Rule of thumb:** data that must persist or be trusted → backend tool + server store. Pure UI effects (highlight a row, switch a tab, open a modal) → frontend tool. Facts the agent only needs to read → `useAgentContext`.

### 7.3 `useAgentContext` vs shared state (`useCoAgent`'s successor)

|                    | `useAgentContext`                      | Shared state (`useAgent` → `agent.state` / `agent.setState`) |
| ------------------ | -------------------------------------- | ------------------------------------------------------------ |
| Direction          | UI → agent, read-only                  | two-way                                                      |
| Use                | current user, page, todo list snapshot | progress, drafts, agent-written results rendered live        |
| Agent can write it | no                                     | yes (Python state key, e.g. via `Command(update=...)`)       |
| Cleanup            | unregisters on unmount                 | n/a                                                          |

### 7.4 Multi-agent patterns (we use the supervisor)

| Pattern                              | Idea                                        | Trade-off                                              |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------------------ |
| One agent, all tools                 | single graph                                | simplest, prompt crowds as tools grow                  |
| Router                               | first node classifies, edge to a specialist | cheaper, lower latency, weak for cross-domain requests |
| **Supervisor + sub-agents (chosen)** | supervisor LLM calls specialists as tools   | handles multi-step cross-domain work, more LLM calls   |

The frontend always passes one `agentId`. Sub-agents are invisible to the UI unless you publish their activity through shared state (the docs' "delegation log").

### 7.5 In-memory data facts

A module-level dict lives only as long as the Python process. Auto-reload wipes it. Multiple workers each get their own copy, so run **one worker**. It is unrelated to LangGraph's `MemorySaver`, which stores conversation state per thread.

---

## 8. Old (v1) → new (v2) replacement guide

IDE strikethroughs and `@deprecated` messages mean "you are on v1". v1 still runs but is deprecated.

### 8.1 React hooks and components

| Old (v1, deprecated)                                         | New (v2)                                                                                   | Notes                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `CopilotKit` from `@copilotkit/react-core`                   | `CopilotKit` from `@copilotkit/react-core/v2`                                              | same name, new import path. `<CopilotKitProvider agentId=…>` is the alternative spelling |
| `useCopilotChat()`                                           | `useAgent({ agentId })` + `useCopilotKit()`                                                |                                                                                          |
| `visibleMessages`                                            | `agent.messages`                                                                           | roles are plain strings `"user"`/`"assistant"`/`"tool"`                                  |
| `isLoading`                                                  | `agent.isRunning`                                                                          |                                                                                          |
| `appendMessage(new TextMessage({role: Role.User, content}))` | `agent.addMessage({id, role:"user", content})` then `await copilotkit.runAgent({ agent })` | `TextMessage`/`Role` from `runtime-client-gql` no longer needed                          |
| `useCopilotReadable({description, value})`                   | `useAgentContext({description, value})`                                                    | one-way, unregisters on unmount                                                          |
| `useCopilotAction({name, parameters:[…], handler})`          | `useFrontendTool({name, parameters: z.object({…}), handler}, deps?)`                       | zod instead of parameter arrays. Handler return value becomes the tool result            |
| `useCoAgent` (shared state)                                  | `useAgent` → `agent.state`, `agent.setState`, `updates: [UseAgentUpdate.OnStateChanged]`   |                                                                                          |
| `useCopilotAction` with `render`                             | `useFrontendTool({ …, render })`, `useRenderTool`, `useComponent`                          |                                                                                          |
| `<CopilotChat>` etc.                                         | still exist in v2 but **not used here** (custom chat required)                             |                                                                                          |

### 8.2 Runtime (Next.js)

| Old (v1)                                                                     | New (v2)                                                                                                                   |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `import … from "@copilotkit/runtime"`                                        | `import … from "@copilotkit/runtime/v2"` (the package root is the v1 surface: routes 404)                                  |
| `new CopilotRuntime({ remoteEndpoints: [copilotKitEndpoint({url})] })`       | `new CopilotRuntime({ agents: { name: new HttpAgent({url}) }, runner: new InMemoryAgentRunner() })`                        |
| `LangGraphHttpAgent` from `@copilotkit/runtime/langgraph`                    | `HttpAgent` from `@ag-ui/client` (plain AG-UI client)                                                                      |
| `ExperimentalEmptyAdapter`                                                   | not needed (the agent owns the LLM)                                                                                        |
| `copilotRuntimeNextJSAppRouterEndpoint({runtime, serviceAdapter, endpoint})` | `createCopilotRuntimeHandler({ runtime, basePath })`                                                                       |
| `app/api/copilotkit/route.ts`, `export const POST`                           | `app/api/copilotkit/[[...slug]]/route.ts`, export `GET`, `POST`, `PATCH`, `DELETE`                                         |
| single-route transport                                                       | multi-route; provider needs `useSingleEndpoint={false}` (or omit it so the client auto-detects; docs: default from 1.70.2) |

### 8.3 Python SDK

| Old                                                                                     | New                                                                                                                                                         |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CopilotKitRemoteEndpoint` + `add_fastapi_endpoint` (`copilotkit.integrations.fastapi`) | `add_langgraph_fastapi_endpoint(app=…, agent=…, path=…)` from `ag_ui_langgraph`                                                                             |
| `LangGraphAgent` from `copilotkit` (import error: "did you mean LangGraphAGUIAgent")    | `LangGraphAGUIAgent` from `copilotkit`                                                                                                                      |
| `CopilotKitState`                                                                       | still valid (`state["copilotkit"]["actions"]` = frontend tools, `["context"]` = app context)                                                                |
| hand-written graph with `bind_tools` (this project)                                     | docs now recommend `create_agent(...)` with `middleware=[CopilotKitMiddleware()]`, which forwards frontend tools and context automatically (see section 12) |

Install note from the docs for the Python SDK: `pip install copilotkit --extra-index-url https://copilotkit.gateway.scarf.sh/simple/`.

---

## 9. Run and test checklist

1. `GET http://localhost:8000/health` → `{"status":"ok"}`.
2. `GET http://localhost:8000/docs` lists `POST /copilotkit/main` and `/api/money/*`.
3. `GET http://localhost:3000/api/copilotkit/info` lists `main_assistant`.
4. Python terminal prints `[supervisor] browser tools: [...]` with the four todo tools on `/`, and an empty list on `/money`.
5. Todos (`/`): `add buy milk and call dentist` → two `⚙ add_todo` chips, list updates. `how many todos do I have?` → answered, no tool. `change buy milk to oat milk`, `mark dentist as done`, `delete oat milk`.
6. Money (`/money`): add a row by hand, then `spent 250 on lunch and 1200 on groceries`, `what is my total spending by category?`, edit a row in the UI then `list my transactions`.
7. Layout: the chat stays on the right at 30% when you navigate, and a half-typed message survives the page change.
8. Cross-page: on `/money` ask `add todo call dentist` → the agent should say the todo list is not available here. On `/` log `spent 100 on tea`, then open `/money` → the row is there.
9. **Mixed request:** `add a todo to pay rent and log 15000 income as salary`. Expect exactly one todo, one transaction, no API error about missing tool results.
10. Restart the Python server → money data is gone (expected).

---

## 10. History: what was built, in order, and every error we hit

**2026-10-10**

1. Request: CopilotKit + AG-UI POC with Next.js, FastAPI, LangGraph, Groq; self-hosted first; custom chat; todo CRUD. The user attached an unrelated RAG route file (Groq + Qdrant + Gemini embeddings) only as a style hint.
2. First answer used the **v1** API from memory (`CopilotKitRemoteEndpoint`, `LangGraphAgent`, `useCopilotAction`, `useCopilotChat`, v1 runtime).
3. **Error:** `ImportError: cannot import name 'LangGraphAgent' from 'copilotkit'` → renamed to `LangGraphAGUIAgent`, `add_langgraph_fastapi_endpoint` from `ag_ui_langgraph`, and moved the runtime to `LangGraphHttpAgent` (still v1).
4. **Error:** Next.js "blocking route / `randomUUID()` in a Client Component" in `layout.tsx` → moved `<CopilotKit>` into `providers.tsx` with `<Suspense>`.
5. **Error:** `Cannot read properties of undefined (reading 'filter')` → `useCopilotChat` no longer returns `visibleMessages`.
6. **Deprecation warnings** (`CopilotKit`, `useCopilotChat`, `useCopilotReadable`) → docs checked, migrated the hooks to v2 (`useAgent`, `useAgentContext`, `useFrontendTool`).
7. **Behaviour complaint:** the bot only did the four todo actions and could not chat or answer "how many todos?". Root cause: the system prompt said "ONLY call tools" and the agent never saw the list. Fixed with a general-assistant prompt + `useAgentContext` injected into the prompt.
8. **Runtime route still deprecated** (`CopilotRuntime` from `@copilotkit/runtime`) → migrated to `@copilotkit/runtime/v2`, `createCopilotRuntimeHandler`, `HttpAgent`, `[[...slug]]/route.ts`.
9. First handoff `.md` written (single agent, `web/` folder).

**2026-10-11** 10. Model switched to `openai/gpt-oss-120b`, folder renamed `frontend`. 11. Multi-agent explained; user chose: **supervisor**, todo = frontend tools, **money = backend sub-agent with an in-memory Python dict**, REST API + React Query, one `agentId`. 12. Implemented the supervisor graph, money sub-agent, REST API, React Query hook, 70/30 chat. 13. **Mistake:** first delivery put Todos and Money in **tabs on one page**. The user wanted separate pages → `/` and `/money`. 14. **Error:** browser `Runtime info request failed with status 404`, and `GET /api/copilotkit/info` returned `{"error":"Not found"}`. Cause class: provider/handler transport mismatch (`useSingleEndpoint={false}` against a single-route runtime, or a v1 route file, or importing the runtime from the package root). Fix: v2 multi-route route file in `[[...slug]]`, no leftover `route.ts`. Resolved by the user. 15. **Error:** `agent_run_error_event … HTTP 404: {"detail":"Not Found"}`. `/api/copilotkit/agent/main_assistant/run` was correct; the 404 came from **FastAPI** (second hop). Causes: stale Python process on port 8000 running old code, or `AGENT_BASE_URL` containing a path. Auto-reload had been turned off, so the server needed a manual restart. Resolved by the user ("everything is working fine"). 16. User: chat should not be per page → moved the chat, nav and 70/30 grid into `AppShell` in the root layout; pages became content only. 17. Todo state moved into `TodosProvider` (so todos survive page navigation); tools stay registered only on `/`. 18. `useMoney` now owns refreshing: `useAgent` run status → invalidate on run end, optional 1 s polling while running. `AppShell` no longer knows about money.

---

## 11. Known issues, risks and unverified items

1. **Mixed-request handling is untested** (item 9 in section 9). The supervisor prompt, `parallel_tool_calls=False` and `tools_node` all exist to prevent a browser tool call and a backend call in one message. If a duplicate todo or an API error about missing tool results appears, read the Python log first.
2. **`parallel_tool_calls=False`** is passed through `bind_tools` to Groq. If the API rejects it, delete it.
3. **`UseAgentUpdate` import** in `useMoney.ts` is assumed to be exported from `@copilotkit/react-core/v2` (taken from the docs' examples).
4. **Sub-agent output** might surface as an extra chat bubble. Not observed yet.
5. **Auto-reload is off.** Restart `python main.py` after every Python change, or set `RELOAD=1` and accept that money data resets on each save. A stale process on port 8000 produces the FastAPI 404 above. Check with `Get-NetTCPConnection -LocalPort 8000 -State Listen`.
6. **Memory everywhere:** `MemorySaver` (LangGraph threads), `InMemoryAgentRunner` (runtime threads), the money dict, and React-state todos all vanish on restart or refresh.
7. **No auth.** `DEMO_USER = "demo"` for everyone. The runtime's default thread routes are unauthenticated (any caller that reaches them can read or clear threads). CORS is limited to `FRONTEND_ORIGIN`.
8. **Multiple workers** would give each worker its own money dict. Use one.
9. **One shared HttpAgent instance** at module scope is fine for local single-user use. For multi-user, create agents per request (the docs warn that one instance runs one turn at a time).
10. **Chat UI is basic:** raw text (markdown not rendered), tool calls shown as a plain text chip, no stop button, no error banner.
11. **Polling** adds about one request per second during a run on `/money`. Safe to remove.
12. **Context snapshot** (3.3): the agent must call tools for money data.
13. **Phase 2 (CopilotKit Cloud) is unresearched.** An earlier note said "swap `runtimeUrl` for `publicApiKey`". That came from memory and is unverified. Read the current Cloud / Intelligence docs first.

---

## 12. Better things we can do (recommended next steps)

**Backend**

- **Adopt the docs' Python pattern:** `create_agent(model=…, tools=[…], middleware=[CopilotKitMiddleware()], state_schema=…)`. It forwards frontend tools and context automatically and removes the need for the hand-written `frontend_tools()` / `context_text()` helpers. If tools or todo context ever fail to reach the agent (the `[supervisor] browser tools:` log is empty), this is the first thing to try.
- **Real database:** swap `money_store.py` for MongoDB (PyMongo async client, `AsyncMongoClient`, version 4.13+) behind the same function signatures, so the tools and REST endpoints do not change. Use a service layer, keep ids as `str(ObjectId)`, scope every query by `user_id`. A full commented MongoDB design (service layer, tools, REST routes, tool loop wiring) was provided earlier as `todos_db_example.py`; recreate it if needed.
- **Persist agent memory:** replace `MemorySaver` with a SQLite or Postgres LangGraph checkpointer, and the runtime's `InMemoryAgentRunner` with a persistent runner (the docs mention `SqliteAgentRunner` and CopilotKit Intelligence threads).
- **Auth end to end:** `identifyUser` on the runtime, forward `Authorization` to FastAPI (the runtime forwards `authorization` and `x-*` headers by default), derive the user id server-side, protect thread routes with the handler hooks (`onBeforeHandler`).
- **Observability:** LangSmith traces for the graph, the CopilotKit Inspector for events and state.
- **Validation:** pydantic models for tool arguments and tighter error messages returned to the model.
- **Add a third specialist** (for example notes) by adding one tool like `ask_notes_manager`, and keep the pattern: sub-agent = prompt + tools + loop. Consider the router pattern if latency matters, since the supervisor adds LLM calls.

**Data flow**

- **Todos persistence:** either localStorage (quick) or make todos a backend domain too (second sub-agent + REST + React Query), which removes the browser-only special case and the mixed-tool risk. Keep a small frontend tool only for pure UI effects (highlight the row the agent just changed, switch a filter).
- **Replace polling with shared state:** have backend tools return `Command(update={...})` into agent state and render `agent.state` in the UI. Be aware that state is tied to a thread, and the docs say state normally updates between checkpoints unless you stream it.
- **Delegation log:** publish sub-agent activity through shared state (the docs' sub-agent demo) so the UI can show "Money manager is working…".

**Frontend**

- Render assistant text as markdown (`react-markdown` + `remark-gfm`).
- Render tool calls as status cards ("Added: buy milk") using `render` in `useFrontendTool`, `useRenderToolCall`, or by matching `role: "tool"` messages by `toolCallId`.
- Add a stop button (the runtime exposes a stop route), an error banner for `runAgent` failures, suggestions, and a "new chat" button.
- Handle small screens (the 70/30 grid is desktop-only today).
- Rename the `proivders` folder to `providers` and fix the imports. Remove unused packages (`@copilotkit/runtime-client-gql`) and the unused `onRunFinished` prop if it stays unused.
- Add `staleTime` back, with `refetchOnMount: "always"` on the money queries.

**Quality**

- pytest for `money_store` and the tool loop (`route`, `tools_node`) with a fake LLM.
- Playwright for the flows in section 9.
- A CI step that type-checks the frontend and runs the Python tests.

**Phase 2: CopilotKit Cloud**
Research the current docs first (Cloud and Intelligence). The UI, hooks and graphs should stay the same. Only the runtime and connection layer should change. Do not rely on the earlier unverified `publicApiKey` note.

---

## 13. Notes for an AI agent continuing this project

- **Read the docs before writing any CopilotKit code.** Start at https://docs.copilotkit.ai/langgraph-python and prefer pages under `/langgraph-python/...` and `/reference/v2/...`. Do not reuse v1 APIs from memory.
- **Never** introduce `<CopilotChat>`, `<CopilotSidebar>`, `<CopilotPopup>`, `useCopilotChat`, `useCopilotAction`, `useCopilotReadable`, `useCoAgent`, or imports from the root of `@copilotkit/runtime`.
- **User preferences:** custom chat only; one chat in the layout; 70/30 layout on every page; separate pages (not tabs); one `agentId` (`main_assistant`) with backend routing; todos = frontend tools in React state; money = backend dict + REST + React Query; Groq with `openai/gpt-oss-120b`; folder names `agent` and `frontend`; Windows/PowerShell commands; step-by-step answers with full files they can paste; the user writes informally, so confirm intent when a request is ambiguous and quote exact file paths.
- **Naming must match in three places** if you ever rename the agent: the key in `route.ts`, `agent`/`agentId` in `providers.tsx`, `ChatPanel`, `useMoney` and `AppShell`, and `name=` in `main.py`. Also keep the FastAPI path `/copilotkit/main` in sync with the runtime URL.
- **Changing Python code requires a manual restart** (reload is off). Changing `.env.local` requires restarting `npm run dev`.
- **When something 404s**, identify which hop failed: browser → Next.js runtime (`/api/copilotkit/...`), or runtime → FastAPI (`{"detail":"Not Found"}` is FastAPI's body). Use `/info`, `/docs` and `/openapi.json` to see what each side serves.
- **Keep one source of truth per dataset.** Do not let both React state and a server store own the same data.
- **Do not state something as verified unless it was tested or read in the docs.** Update section 0 and section 11 when you confirm or fix an item.

---

## 14. References

- Headless UI (custom chat): https://docs.copilotkit.ai/langgraph-python/custom-look-and-feel/headless-ui
- Frontend tools: https://docs.copilotkit.ai/langgraph-python/frontend-tools
- `useFrontendTool` reference: https://docs.copilotkit.ai/reference/v2/hooks/useFrontendTool
- Shared state and read-only context: https://docs.copilotkit.ai/langgraph-python/shared-state
- Sub-agents: https://docs.copilotkit.ai/langgraph-python/multi-agent/subagents
- Copilot Runtime: https://docs.copilotkit.ai/langgraph-python/backend/copilot-runtime
- Runtime HTTP endpoints (routes, provider/handler pairs, 404 causes): https://docs.copilotkit.ai/langgraph-python/backend/runtime-endpoints
