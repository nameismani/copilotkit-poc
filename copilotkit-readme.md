# CopilotKit + AG-UI Todo POC: Handoff and Learning Guide

> **Audience:** a future AI agent or a human continuing this project, who is also learning CopilotKit.
> **How to use:** read sections 1-4 for context, section 5 for the current code, section 7 for the next task.
> **Written:** 2026-10-10. CopilotKit changes its API often, so verify against https://docs.copilotkit.ai before trusting any import in this file.

---

## 1. Goal

Build a proof of concept (POC) of CopilotKit with the AG-UI protocol on a simple todo app.

| Item                   | Decision                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Frontend               | Next.js (App Router, TypeScript, Tailwind)                                                                                 |
| Backend                | FastAPI (Python)                                                                                                           |
| Agent framework        | LangGraph                                                                                                                  |
| LLM                    | Groq Cloud, `openai/gpt-oss-120b` (the 8B instant model was unreliable at tool calling)                                    |
| Chat UI                | **Custom chatbot built by hand.** Do NOT use the prebuilt `<CopilotChat>` / `<CopilotSidebar>`                             |
| Todo actions           | add, edit text, delete, mark completed / not completed                                                                     |
| Extra behaviour wanted | The agent must also answer normal questions and answer questions about the todo list ("how many todos?", "what are they?") |
| Phases                 | **Phase 1: self-hosted runtime (current).** Phase 2: CopilotKit Cloud (not started)                                        |

The user is on Windows (PowerShell, Python venv at `agent\.venv`). The user is in India (IST).

---

## 2. Key concepts (learning section)

Read this once. It explains why the code looks the way it does.

### 2.1 The three layers

```
Browser (React, CopilotKit hooks)
   |  talks to
   v
Copilot Runtime  (self-hosted inside Next.js at /api/copilotkit)   <- routes and secures agent traffic
   |  talks AG-UI over HTTP (streaming events)
   v
Agent server (FastAPI + LangGraph + Groq)                           <- the "brain"
```

- **AG-UI** is an open protocol: a stream of typed events (text chunks, tool calls, state) between an agent and a UI. CopilotKit's frontend is an AG-UI client.
- **Copilot Runtime** sits between browser and agent. It handles routing by agent name, auth, and middleware. The browser never calls FastAPI directly.
- **Agent name** is the key in the runtime's `agents` map (here `todo_agent`). The frontend asks for that exact name. It is not the agent's internal `name` or class.

### 2.2 Two kinds of tools

|                     | Frontend tool                                           | Backend tool                      |
| ------------------- | ------------------------------------------------------- | --------------------------------- |
| Declared in         | React (`useFrontendTool`)                               | Python (LangGraph tool)           |
| Runs in             | The user's browser                                      | The FastAPI server                |
| Can touch           | React state, DOM, localStorage                          | Database, other APIs, secrets     |
| How the LLM sees it | CopilotKit forwards the schema to the agent on each run | Bound directly in the graph       |
| Used in this POC    | **Yes, currently** (todos live in React state)          | **Not yet. Planned in section 7** |

### 2.3 Context

`useAgentContext({ description, value })` publishes app state to the agent on each run. The agent receives it and the graph injects it into the system prompt. This is how the agent can answer "how many todos do I have?" without calling a tool.

### 2.4 Headless / custom chat

`useAgent({ agentId })` returns the live conversation (`agent.messages`, `agent.isRunning`). `useCopilotKit()` returns a handle with `runAgent({ agent })`. To send a message: `agent.addMessage(...)` then `copilotkit.runAgent({ agent })`. That is the whole custom-chat core.

### 2.5 v1 vs v2 API (the source of most pain)

CopilotKit has a legacy v1 API and a newer v2 API built on AG-UI. v1 still works but is **deprecated**. IDE strikethroughs and `@deprecated` warnings mean "you are using v1".

| Concern          | v1 (deprecated)                             | v2 (current)                                                  |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------- |
| Provider         | `CopilotKit` from `@copilotkit/react-core`  | `CopilotKit` from `@copilotkit/react-core/v2`                 |
| Custom chat      | `useCopilotChat`                            | `useAgent` + `useCopilotKit`                                  |
| Share state      | `useCopilotReadable`                        | `useAgentContext`                                             |
| Frontend actions | `useCopilotAction`                          | `useFrontendTool` (zod `parameters`)                          |
| Runtime class    | `CopilotRuntime` from `@copilotkit/runtime` | `CopilotRuntime` from `@copilotkit/runtime/v2`                |
| Next.js route    | `copilotRuntimeNextJSAppRouterEndpoint`     | `createCopilotRuntimeHandler`                                 |
| Route file       | `app/api/copilotkit/route.ts`               | `app/api/copilotkit/[[...slug]]/route.ts`                     |
| Remote agent     | `remoteEndpoints` / `LangGraphHttpAgent`    | `agents: { name: new HttpAgent({url}) }` from `@ag-ui/client` |
| Service adapter  | `ExperimentalEmptyAdapter`                  | not needed (the agent owns the LLM)                           |
| Transport        | single endpoint                             | multi-route (`useSingleEndpoint={false}`)                     |

---

## 3. History: what happened, in order

Mistakes are recorded on purpose so a future agent does not repeat them. The first answers were written from memory of an older CopilotKit. Later ones were verified against the docs.

1. **Request.** POC with Next.js + FastAPI + LangGraph + CopilotKit + AG-UI, self-hosted first, Groq as the model, custom chat UI, simple todo CRUD. The user also attached an unrelated file (a RAG "personal assistant" API route using Groq + Qdrant + Gemini embeddings). It was used only as a hint to prefer Groq. Its model `llama-3.1-8b-instant` was swapped for the 70B model.
2. **First implementation (v1 style).** Python used `CopilotKitRemoteEndpoint` + `LangGraphAgent` + `add_fastapi_endpoint`. Next.js used v1 `CopilotRuntime` with `remoteEndpoints`. The UI used `useCopilotChat` / `useCopilotAction` / `useCopilotReadable`.
3. **Error 1: `ImportError: cannot import name 'LangGraphAgent' from 'copilotkit'`.** Python SDK renamed the class. Fixed with `LangGraphAGUIAgent` and `add_langgraph_fastapi_endpoint` from `ag-ui-langgraph`.
4. **Errors 2 and 3 in the browser.**
   - Next.js "blocking route": `<CopilotKit>` used `randomUUID()` during prerender in `layout.tsx`. Fix: a separate `"use client"` `providers.tsx` wrapped in `<Suspense>`.
   - `Cannot read properties of undefined (reading 'filter')`: `useCopilotChat()` no longer returned `visibleMessages`.
5. **Deprecation warnings** on `CopilotKit`, `useCopilotChat`, `useCopilotReadable`. Root cause: v1 API (section 2.5). Migrated the frontend to v2 hooks.
6. **Behaviour complaint.** The bot only did the 4 tool actions and could not chat or report on the list. Root cause was in the graph: the system prompt said "ONLY call tools", and the agent had no access to the todo list. Fixed by a general-assistant prompt plus `useAgentContext` injected into the system prompt.
7. **Runtime route still deprecated.** Migrated the Next.js route to the v2 handler (section 5.5).
8. **Open at the time of writing:** chat UI looks poor, todos are not persisted, nothing has been run end to end after the v2 migration (section 6).

### Previous flow (v1, now obsolete)

```
useCopilotChat / useCopilotAction  ->  /api/copilotkit (v1 CopilotRuntime, LangGraphHttpAgent)
   ->  FastAPI (CopilotKitRemoteEndpoint + LangGraphAgent)  ->  LangGraph  ->  Groq
```

### Current flow (v2)

```
useAgent / useFrontendTool / useAgentContext
   ->  /api/copilotkit/[[...slug]]  (v2 CopilotRuntime + createCopilotRuntimeHandler, HttpAgent)
   ->  FastAPI /copilotkit  (add_langgraph_fastapi_endpoint + LangGraphAGUIAgent)
   ->  LangGraph chat_node  ->  Groq
   ->  tool call returned to browser  ->  frontend handler updates React state
   ->  tool result sent back -> agent run continues -> short confirmation text
```

---

## 4. Project layout

```
copilotkit-poc/
  agent/                  # Python
    .venv/
    .env                  # GROQ_API_KEY=...
    graph.py              # LangGraph agent
    main.py               # FastAPI + AG-UI endpoint at /copilotkit
  frontend/                    # Next.js
    .env.local            # AGENT_URL=http://localhost:8000/copilotkit
    app/
      layout.tsx
      providers.tsx
      page.tsx
      hooks/useTodos.ts
      components/CustomChat.tsx
      api/copilotkit/[[...slug]]/route.ts
```

Run (two terminals):

```powershell
# Terminal 1
cd agent; .\.venv\Scripts\Activate.ps1; python main.py      # http://localhost:8000/health
# Terminal 2
cd frontend; npm run dev                                          # http://localhost:3000
```

Packages:

```powershell
# agent
pip install -U fastapi uvicorn python-dotenv copilotkit ag-ui-langgraph langgraph langchain-groq
# web
npm i @copilotkit/react-core@latest @copilotkit/runtime@latest @ag-ui/client@latest zod
```

---

## 5. Current code (v2 migration)

**Status: code matches the docs fetched on 2026-10-10 but has NOT been confirmed running end to end.**

### 5.1 `agent/graph.py`

```python
from typing import Any
from langchain_core.messages import SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_groq import ChatGroq
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph, END
from copilotkit import CopilotKitState


class AgentState(CopilotKitState):
    pass


def _context_text(state: AgentState) -> str:
    """Turn app context from the frontend (useAgentContext) into prompt text."""
    ctx = (state.get("copilotkit") or {}).get("context") or []
    parts = []
    for item in ctx:
        if isinstance(item, dict):
            desc, val = item.get("description", ""), item.get("value", "")
        else:
            desc, val = getattr(item, "description", ""), getattr(item, "value", "")
        parts.append(f"{desc}:\n{val}")
    return "\n\n".join(parts) if parts else "(no app context provided)"


async def chat_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    model = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.3)

    tools = (state.get("copilotkit") or {}).get("actions") or state.get("tools") or []
    print("Frontend tools:", [t.get("name") or t.get("function", {}).get("name") for t in tools if isinstance(t, dict)])
    model_with_tools = model.bind_tools(tools) if tools else model

    system = SystemMessage(content=f"""You are a friendly, helpful AI assistant inside a todo app.

How to behave:
- Chat normally. Answer general questions (facts, advice, explanations, small talk) like any good assistant.
- Questions ABOUT the todo list (how many, which are done or pending, details) must be answered from the app context below. Do NOT call a tool for these.
- Call a tool ONLY when the user asks to change the list: add, edit, delete, or mark done or not done.
- Always take ids from the app context. Never invent an id.
- After using a tool, confirm briefly in plain language what you did.
- Use short markdown (lists are fine) when listing todos.

=== APP CONTEXT (live from the UI) ===
{_context_text(state)}
""")

    response = await model_with_tools.ainvoke([system, *state["messages"]], config)
    return {"messages": [response]}


workflow = StateGraph(AgentState)
workflow.add_node("chat_node", chat_node)
workflow.set_entry_point("chat_node")
workflow.add_edge("chat_node", END)

graph = workflow.compile(checkpointer=MemorySaver())
```

### 5.2 `agent/main.py`

```python
import os
from dotenv import load_dotenv
load_dotenv()

import uvicorn
from fastapi import FastAPI
from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from copilotkit import LangGraphAGUIAgent
from graph import graph

app = FastAPI()

add_langgraph_fastapi_endpoint(
    app=app,
    agent=LangGraphAGUIAgent(
        name="todo_agent",
        description="Manages a todo list: add, edit, delete, complete tasks.",
        graph=graph,
    ),
    path="/copilotkit",
)

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
```

### 5.3 `web/app/providers.tsx` and `web/app/layout.tsx`

```tsx
// providers.tsx
"use client";
import { CopilotKit } from "@copilotkit/react-core/v2";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="todo_agent"
      useSingleEndpoint={false}
    >
      {children}
    </CopilotKit>
  );
}
```

```tsx
// layout.tsx
import "./globals.css";
import { Suspense } from "react";
import Providers from "./providers";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  );
}
```

If the `randomUUID` prerender error returns: make `RootLayout` `async` and `await connection()` (from `next/server`) as its first line.

### 5.4 `web/app/hooks/useTodos.ts`

```ts
"use client";
import { useState } from "react";
import { useFrontendTool, useAgentContext } from "@copilotkit/react-core/v2";
import { z } from "zod";

export type Todo = { id: string; text: string; completed: boolean };

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);

  const add = (text: string) => {
    const id = crypto.randomUUID();
    setTodos((p) => [...p, { id, text, completed: false }]);
    return id;
  };
  const edit = (id: string, text: string) =>
    setTodos((p) => p.map((t) => (t.id === id ? { ...t, text } : t)));
  const remove = (id: string) => setTodos((p) => p.filter((t) => t.id !== id));
  const toggle = (id: string, completed?: boolean) =>
    setTodos((p) =>
      p.map((t) =>
        t.id === id ? { ...t, completed: completed ?? !t.completed } : t,
      ),
    );

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

  return { todos, add, edit, remove, toggle };
}
```

### 5.5 `web/app/api/copilotkit/[[...slug]]/route.ts`

The folder name must be exactly `[[...slug]]`. Delete any old `app/api/copilotkit/route.ts`.

```ts
import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";
import { HttpAgent } from "@ag-ui/client";

const runtime = new CopilotRuntime({
  agents: {
    todo_agent: new HttpAgent({ url: process.env.AGENT_URL! }), // http://localhost:8000/copilotkit
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

Check registration: `GET http://localhost:3000/api/copilotkit/info` should list `todo_agent`.

### 5.6 `web/app/components/CustomChat.tsx` (v2, headless)

```tsx
"use client";
import { useState } from "react";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";

export default function CustomChat() {
  const { agent } = useAgent({ agentId: "todo_agent" });
  const { copilotkit } = useCopilotKit();
  const [input, setInput] = useState("");

  const send = async () => {
    const text = input.trim();
    if (!text || agent.isRunning) return;
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content: text });
    setInput("");
    try {
      await copilotkit.runAgent({ agent });
    } catch (err) {
      console.error("runAgent failed", err);
    }
  };

  const messages: any[] = agent.messages ?? [];

  return (
    <div className="flex h-full flex-col rounded-xl border">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => {
          if (m.role === "user" && typeof m.content === "string") {
            return (
              <div
                key={m.id}
                className="ml-auto max-w-[80%] rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
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
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900">
                    {m.content}
                  </div>
                )}
              </div>
            );
          }
          return null;
        })}
        {agent.isRunning && (
          <div className="text-xs text-gray-400">Thinking…</div>
        )}
      </div>
      <div className="flex gap-2 border-t p-3">
        <input
          className="flex-1 rounded border px-3 py-2 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder='Try: "how many todos do I have?" or "add buy milk"'
        />
        <button
          onClick={send}
          className="rounded bg-blue-600 px-4 text-sm text-white"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

### 5.7 `web/app/page.tsx` (unchanged since the first version)

```tsx
"use client";
import { useState } from "react";
import { useTodos } from "./hooks/useTodos";
import CustomChat from "./components/CustomChat";

export default function Home() {
  const { todos, add, edit, remove, toggle } = useTodos();
  const [text, setText] = useState("");

  return (
    <main className="mx-auto grid h-screen max-w-5xl grid-cols-2 gap-6 p-6">
      <section>
        <h1 className="mb-4 text-xl font-bold">Todos</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) {
              add(text.trim());
              setText("");
            }
          }}
          className="mb-4 flex gap-2"
        >
          <input
            className="flex-1 rounded border px-3 py-2"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="New task"
          />
          <button className="rounded bg-black px-4 text-white">Add</button>
        </form>
        <ul className="space-y-2">
          {todos.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded border p-2"
            >
              <input
                type="checkbox"
                checked={t.completed}
                onChange={() => toggle(t.id)}
              />
              <input
                className={`flex-1 bg-transparent ${t.completed ? "line-through text-gray-400" : ""}`}
                value={t.text}
                onChange={(e) => edit(t.id, e.target.value)}
              />
              <button onClick={() => remove(t.id)} className="text-red-500">
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="h-full">
        <CustomChat />
      </section>
    </main>
  );
}
```

---

## 6. Known issues and unverified items

1. **Not verified end to end after the v2 migration.** First thing to do: run both servers, open `/api/copilotkit/info`, then test prompts in section 8.
2. **Context delivery path is uncertain.** The Next.js side uses a plain `HttpAgent`, while Python uses `LangGraphAGUIAgent`. `graph.py` reads context from `state["copilotkit"]["context"]` and tools from `state["copilotkit"]["actions"]` (falling back to `state["tools"]`). If the agent cannot see todos or tools, read the `Frontend tools:` log in the Python terminal and check where AG-UI puts context and tools in the state.
3. **`useAgentContext` options** (`description`, `value`) were not confirmed in the docs fetched. Re-check if it errors.
4. **The docs show a different Python pattern:** `create_agent(...)` with `CopilotKitMiddleware()` from `copilotkit`, which forwards frontend tools and context into the graph automatically. If item 2 fails, migrate `graph.py` to that pattern.
5. **Chat UI quality is poor** (user complaint). Causes: assistant text is rendered raw (markdown lists show as plain text), no auto-scroll, tool calls are just a text line, no error state, no streaming-cursor feel. See task 7.2.
6. **No persistence.** Todos live in React state and vanish on refresh. See section 7.1.
7. **Conversation memory** is `MemorySaver` (in-process). It resets when the Python server restarts.
8. **Phase 2 (Cloud) is unresearched.** An earlier note said "swap `runtimeUrl` for `publicApiKey`". That was from memory and is unverified. Fetch the current CopilotKit Cloud / Intelligence docs before writing it.

---

## 7. Next tasks

### 7.1 Where do database writes belong? (answers the user's open question)

Today the "database" is React state, and the agent changes it through **frontend tools**. That is fine for a demo, but it cannot persist. A real database cannot be written from the browser directly (no secrets, no trust). So the write must go through the FastAPI server. There are two designs:

**Design A: Backend tools (recommended).** The agent's tools run in Python and write to the DB.

```
User message -> agent (LangGraph) -> tool call add_todo -> Python function writes DB -> result back to LLM -> reply
                                                                                         |
UI <- refetch GET /api/todos after the run finishes <------------------------------------+
```

- Put DB logic in one service layer (`todos_service.py`: `add_todo`, `edit_todo`, `delete_todo`, `set_completed`, `list_todos`).
- Expose it twice: as REST endpoints for the UI (`GET/POST/PATCH/DELETE /todos`) and as LangGraph `@tool` functions for the agent. Both call the same service functions, so there is one source of truth.
- The graph needs a **tool loop**: `chat_node -> (tool calls?) -> ToolNode -> chat_node -> END`. The current graph goes straight to `END`.
- Add a `list_todos` tool. The agent then reads the database itself and no longer depends on `useAgentContext` for todo data (context stays useful for things like the current user).
- The UI must refresh after the agent changes data. Options: refetch when the run ends (watch `agent.isRunning` going true -> false, or subscribe via `useAgent`), or use TanStack Query and invalidate on run end. Shared agent state (AG-UI state events) is a heavier alternative.
- Auth: the service layer needs the user id. Forward an auth header through the runtime (the runtime forwards `authorization` and `x-*` headers to the agent by default) or pass the user id in context.

**Design B: Keep frontend tools, but their handlers call the REST API.**

```
agent tool call -> browser handler -> fetch POST /api/todos -> FastAPI writes DB -> handler updates UI -> result back to agent
```

- Smallest change from today. The UI updates instantly and uses the user's own session.
- Downside: the agent only works while a browser tab is open, and the logic lives in two places (React handler and API).

**Recommendation:** Design A for anything beyond the demo, because the data-changing code stays on the server and the agent works without a browser. Use Design B only if you want to keep the "agent drives the UI" story that frontend tools demonstrate. Either way the database sits behind FastAPI REST endpoints.

Suggested DB for the POC: SQLite via SQLAlchemy (zero setup), then swap to PostgreSQL later.

### 7.2 Improve the custom chat UI

- Render assistant text as markdown (`react-markdown` + `remark-gfm`), with styles for lists and bold.
- Auto-scroll to the newest message (ref + `useEffect` on messages).
- Show tool calls as a small status card ("Added: buy milk") using the matching tool result message (`role: "tool"`, linked by `toolCallId`).
- Show an error banner when `runAgent` throws, and disable the input while `agent.isRunning`.
- The docs describe `useRenderToolCall` for rendering tool calls and a "headless-complete" demo that shows a full hand-built message list. Use it as a reference.

### 7.3 Phase 2: CopilotKit Cloud

Research first (section 6, item 8). Keep the UI, hooks and graph as they are and change only the runtime and connection layer.

---

## 8. Test checklist

1. `GET http://localhost:8000/health` returns `{"status":"ok"}`.
2. `GET http://localhost:3000/api/copilotkit/info` lists `todo_agent`.
3. Python terminal prints `Frontend tools: [...]` with the 4 tool names on a chat request.
4. Prompts, in order:
   - `what is the capital of France?` (normal answer, no tool call)
   - `add buy milk and call dentist` (two `add_todo` calls, list updates)
   - `how many todos do I have and what are they?` (answered from context, no tool call)
   - `change buy milk to buy oat milk`
   - `mark dentist as done`, then `which ones are pending?`
   - `delete oat milk`

---

## 9. Troubleshooting quick reference

| Symptom                              | Likely cause / fix                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `ImportError: LangGraphAgent`        | Old SDK name. Use `LangGraphAGUIAgent` and `ag_ui_langgraph.add_langgraph_fastapi_endpoint`              |
| Prerender `randomUUID` error         | Provider in a `"use client"` file + `<Suspense>`; else `await connection()` in layout                    |
| `visibleMessages` undefined          | v1 hook removed. Use `useAgent().agent.messages`                                                         |
| Strikethrough / `@deprecated` in IDE | Using v1 import. Switch to `/v2` paths (section 2.5)                                                     |
| `/api/copilotkit/info` 404           | Folder must be `[[...slug]]`; delete old `route.ts`                                                      |
| `CopilotKitAgentDiscoveryError`      | Agent key in the runtime route and `agent=` prop differ. The error lists the real keys                   |
| Runtime reaches no agent             | `AGENT_URL` must be the FastAPI URL (`http://localhost:8000/copilotkit`), not `/api/copilotkit`          |
| Agent never calls tools              | Check the `Frontend tools:` log. Empty means tools are not reaching the state (section 6, items 2 and 4) |
| Tool calls wrong or ignored          | Keep the 70B model; lower temperature                                                                    |

## 10. References

- Headless UI: https://docs.copilotkit.ai/langgraph-python/custom-look-and-feel/headless-ui
- Frontend tools: https://docs.copilotkit.ai/langgraph-python/frontend-tools
- Copilot Runtime: https://docs.copilotkit.ai/langgraph-python/backend/copilot-runtime
- Runtime HTTP endpoints: https://docs.copilotkit.ai/langgraph-python/backend/runtime-endpoints
