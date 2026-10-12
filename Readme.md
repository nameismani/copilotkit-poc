# CopilotKit v2 + AG-UI — A Learning Guide (built from a real POC)

> **Who this is for:** humans first (learning), AI assistants second (so they don't generate deprecated v1 code).
> **Full working code** lives in [`PROJECT_REFERENCE.md`](./PROJECT_REFERENCE.md). This file explains _why_ and _how_, not every line.

**Stack:** Next.js (`frontend/`) · FastAPI + LangGraph (`agent/`) · Groq `openai/gpt-oss-120b` · self-hosted Copilot Runtime (CopilotKit Cloud is a later step, not covered).

**Legend:** ✅ verified in this POC · ⚠️ from docs/memory, not tested here.

---

## Table of contents

1. [v1 vs v2 — what changed](#1-v1-vs-v2--what-changed)
2. [Mental model: the pieces and how they talk](#2-mental-model)
3. [Challenges we hit and how we solved them](#3-challenges-we-hit-and-how-we-solved-them)
4. [Topic guide: Shared state (with hooks)](#4-shared-state)
5. [Topic guide: Reading & sending messages (custom chat)](#5-custom-chat-messages)
6. [Topic guide: Frontend tools vs backend tools](#6-frontend-tools-vs-backend-tools)
7. [Topic guide: Context (`useAgentContext`)](#7-context)
8. [Topic guide: Multi-agent (supervisor + sub-agents)](#8-multi-agent)
9. [Topic guide: Refreshing UI after backend changes (React Query)](#9-refreshing-ui)
10. [Topic guide: Layout (one chat, many pages)](#10-layout)
11. [Cheat sheet: v1 → v2 mapping](#11-cheat-sheet)
12. [Debugging playbook](#12-debugging-playbook)
13. [Exercises](#13-exercises)
14. [Notes for AI assistants](#14-notes-for-ai-assistants)
15. [Glossary](#15-glossary)
16. [Unverified / next steps](#16-unverified--next-steps)

---

## 1. v1 vs v2 — what changed

**One-line summary:** v1 was a bundle of CopilotKit-specific hooks and a CopilotKit-specific runtime. v2 is a thin layer over the **AG-UI protocol**: you get one _agent_ object and a few focused hooks.

| Topic                           | v1 (deprecated)                                                    | v2 (use this)                                                                                     |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Frontend import                 | `@copilotkit/react-core`                                           | `@copilotkit/react-core/v2`                                                                       |
| Runtime import                  | `@copilotkit/runtime`                                              | `@copilotkit/runtime/v2`                                                                          |
| Core idea                       | "actions", "readables", "co-agents"                                | One **agent** object (AG-UI) + tools + context                                                    |
| Read/write agent state          | `useCoAgent`                                                       | `useAgent` → `agent.state`, `agent.setState`                                                      |
| Give the agent info             | `useCopilotReadable`                                               | `useAgentContext`                                                                                 |
| Let the agent call browser code | `useCopilotAction`                                                 | `useFrontendTool` (zod schema)                                                                    |
| Chat messages / send / loading  | `useCopilotChat` (`visibleMessages`, `appendMessage`, `isLoading`) | `useAgent` → `agent.messages`, `agent.addMessage`, `agent.isRunning` + `useCopilotKit().runAgent` |
| Render a tool call in chat      | `useRenderToolCall`                                                | `useRenderTool`                                                                                   |
| Runtime class                   | `CopilotRuntime` (+ `copilotRuntimeNextJSAppRouterEndpoint`)       | v2 runtime with an `agents` map + handler                                                         |
| Endpoint style                  | single route                                                       | multi-route (`/info`, `/agent/:id/run`) **or** single-route (opt-in)                              |
| Provider                        | `<CopilotKit>` from v1 path                                        | `<CopilotKit>` from `/v2` path (see warning below)                                                |
| Python agent link               | `LangGraphAgent` (CopilotKit SDK)                                  | AG-UI: `LangGraphAGUIAgent` / `add_langgraph_fastapi_endpoint`                                    |

**Why this matters:** in v1, "shared state", "chat" and "actions" were three unrelated APIs. In v2 they are all views on the **same agent**: its `messages`, its `state`, its `tools`, its `context`. Learn `useAgent` first and everything else clicks.

**How to tell you're on v1 by accident:** the browser console says "… is deprecated". Every one of these warnings we saw (`CopilotKit`, `useCopilotChat`, `useCopilotReadable`, `CopilotRuntime`) meant "you imported from the old path". Fix = change the import path **and** the API (they are not drop-in renames).

> ⚠️ Keep exact export names in sync with the version you install; check the package's `/v2` exports when in doubt.

---

## 2. Mental model

```
Browser (Next.js)                         Next.js server                    Python (FastAPI)
┌───────────────────────────┐   HTTP     ┌─────────────────────┐   AG-UI   ┌──────────────────────┐
│ <CopilotKit agent=        │──────────► │ /api/copilotkit/*   │ ────────► │ /copilotkit/main     │
│   "main_assistant">       │            │ Copilot Runtime     │  (stream) │ LangGraph supervisor │
│ useAgent / useFrontendTool│ ◄──────────│ agents: {           │ ◄──────── │  ├ todo? (frontend   │
│ useAgentContext           │   events   │  main_assistant:    │           │  │  tools, via AG-UI)│
└───────────────────────────┘            │   HttpAgent(url)}   │           │  └ money sub-agent   │
                                         └─────────────────────┘           └──────────────────────┘
```

Key facts:

- **AG-UI** = the streaming protocol (events: text deltas, tool calls, state snapshots). CopilotKit's runtime is just a router/proxy for it.
- The **key** in the runtime's `agents: { main_assistant: … }` map is the _only_ routing name. The frontend's `agent="main_assistant"` must match exactly, otherwise: 404 on `/agent/<name>/run`.
- The frontend only knows **one** agent id. Which _backend_ sub-agent does the work is decided in Python (the supervisor). The UI never has to know.
- A **run** = one request/stream. The agent may call tools during it. A **frontend tool call ends the run**; the browser executes it and a _new_ run starts with the result (see §6).

---

## 3. Challenges we hit and how we solved them

Each item: **Symptom → Cause → Fix → Lesson.** These are the real errors from building this POC.

### 3.1 `ImportError: cannot import name 'LangGraphAgent'`

- **Cause:** v1-era class name; AG-UI package uses a different one.
- **Fix:** `from ag_ui_langgraph import add_langgraph_fastapi_endpoint` and `LangGraphAGUIAgent`; mount with `add_langgraph_fastapi_endpoint(app, agent, path="/copilotkit/main")`.
- **Lesson:** blog posts/tutorials are often v1; check the import source.

### 3.2 Next.js prerender error about `randomUUID` in the layout

- **Cause:** `<CopilotKit>` generates a random id; during static prerender in a server layout that's disallowed.
- **Fix:** put providers in a separate `"use client"` file (`providers.tsx`) and wrap in `<Suspense>` in `layout.tsx`.
- **Lesson:** anything random/time-based must not run during server prerender.

### 3.3 `Cannot read properties of undefined (reading 'filter')` on `visibleMessages`

- **Cause:** `useCopilotChat` (v1) no longer returns `visibleMessages` the way we assumed.
- **Fix:** `const { agent } = useAgent(); agent.messages`.
- **Lesson:** in v2 messages live on the agent.

### 3.4 Deprecation warnings everywhere

- **Cause:** v1 imports (see §1).
- **Fix:** migrate every import to `/v2` and replace the hooks per the table.
- **Lesson:** migrate the **runtime** and the **frontend** together; mixing causes transport mismatch (3.6).

### 3.5 Bot "not chatty", couldn't see todos, only 4 tools

- **Cause:** (a) system prompt only talked about tools, (b) the agent had no access to current todo state.
- **Fix:** prompt tells it to answer normal questions normally and use tools only when needed; `useAgentContext` publishes the todo list (§7).
- **Lesson:** the model only knows what's in messages, context, state. If it "can't see" something, you didn't give it.

### 3.6 `/api/copilotkit/info` → `{"error":"Not found"}`

- **Cause:** **transport mismatch.** Frontend was talking multi-route (`/info`, `/agent/…`) but the Next route was a single-endpoint handler (old `route.ts`).
- **Fix:** use the v2 multi-route handler in `app/api/copilotkit/[[...slug]]/route.ts`, import from `@copilotkit/runtime/v2`, **delete the old `route.ts`**. (Alternative: single endpoint on both sides.) We set `useSingleEndpoint={false}` explicitly.
- **Lesson:** frontend and runtime must agree on transport. The `[[...slug]]` optional catch-all is what makes sub-paths work in Next.js.

### 3.7 `{"detail":"Not Found"}` on `/agent/main_assistant/run`

- **Cause:** that JSON shape is **FastAPI's**, not Next's → the Next runtime reached Python but the path was wrong or a **stale process** was still on port 8000. Also: `AGENT_BASE_URL` must be the host only (no path), because we append `/copilotkit/main`.
- **Fix:** kill old uvicorn, restart, set `RELOAD=1` only when you want auto-reload, hit `http://localhost:8000/docs` to confirm routes.
- **Lesson:** read _whose_ error format it is — it tells you which hop failed.

### 3.8 Separate pages, but chat was inside each page

- **Symptom:** user asked for `/` (Todos) and `/money` (Money) as pages with a **single** 70/30 chat; we first built tabs, then per-page chat.
- **Fix:** `AppShell` in the root layout owns nav + one `ChatPanel`; pages render only their panel (§10).
- **Lesson:** one chat = one place, above the router.

### 3.9 Todos lost when navigating between pages

- **Cause:** todos lived in page-level state; page unmount = state gone.
- **Fix:** `TodosProvider` (context) in `providers.tsx`. **Tools stay page-scoped** (registered via `useFrontendTool` in the Todo page), so the agent only has todo tools on `/`.
- **Lesson:** _state_ and _tool registration_ have different lifetimes. Hoist state; keep tools where the UI is.

### 3.10 Backend (money) changes didn't show in UI

- **Cause:** money data changes on the server; the browser doesn't know.
- **Fix:** React Query `invalidateQueries` when the agent run ends (`useAgent` → `isRunning` true→false), plus optional short polling (§9).
- **Lesson:** backend tools change data _outside_ React; you must tell React to re-fetch.

### 3.11 Mixed requests (todo + money in one message)

- **Design fix:** supervisor `route()` only goes to `tools` node if **backend** tools were called; frontend-tool calls end the run so the browser runs them. `parallel_tool_calls=False` avoids both kinds in one assistant turn. ⚠️ not fully tested with Groq.

### Small things worth remembering

- Windows/PowerShell: set env with `$env:RELOAD="1"`, not `RELOAD=1 cmd`.
- A folder typo (`proivders`) silently breaks imports — check path spelling first.
- Reload wipes the Python in-memory store (§9).

---

## 4. Shared state

**What it is:** a JSON object that both the browser and the Python agent can read and write during a conversation. It lives on the agent, rides on AG-UI state events, and is the v2 successor of v1's `useCoAgent`.

### 4.1 When to use which mechanism

| You want to…                                            | Use                                                 |
| ------------------------------------------------------- | --------------------------------------------------- |
| Give the model **read-only info** (current page, todos) | `useAgentContext` (§7)                              |
| **Both sides read/write** a structured object           | **shared state** (`useAgent` + Python state schema) |
| Let the model **do something in the browser**           | `useFrontendTool` (§6)                              |
| Let the model change **server data**                    | backend tool + REST + React Query                   |

### 4.2 Frontend: read & write with `useAgent`

```tsx
import { useAgent } from "@copilotkit/react-core/v2";

function Prefs() {
  const { agent } = useAgent({ agentId: "main_assistant" });

  const theme = agent.state?.preferences?.theme ?? "light";

  const toggle = () =>
    agent.setState({
      // replaces the whole state object!
      ...agent.state,
      preferences: {
        ...agent.state?.preferences,
        theme: theme === "light" ? "dark" : "light",
      },
    });

  return <button onClick={toggle}>{theme}</button>;
}
```

- `agent.state` — current shared state (read).
- `agent.setState(next)` — write; it **replaces**, so always spread the old state.
- `useAgent` re-renders you on changes. To limit re-renders use `updates` (e.g. only state changes) and/or `throttleMs`:

```tsx
import { useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";
const { agent } = useAgent({
  agentId: "main_assistant",
  updates: [UseAgentUpdate.OnStateChanged],
});
```

⚠️ verify the exact `UseAgentUpdate` export path/members in your installed version.

### 4.3 Python: declare the state schema

```python
from typing import Annotated
from langgraph.graph import MessagesState

class MainState(MessagesState):
    preferences: dict          # <- must exist in the schema or the key is dropped
```

- Keys the frontend sends that aren't in the state class are ignored.
- Node returns update state: `return {"preferences": {...}}` (or `Command(update={...})`).
- Updates made in Python are streamed to the browser, so `agent.state` changes live.

### 4.4 Initial state (the `useCoAgent({initialState})` replacement)

`useAgent` has no `initialState` option. Seed it once when ready, **only filling missing keys** so you don't overwrite state restored from the thread:

```tsx
export function useAgentInitialState(
  agentId: string,
  initial: Record<string, unknown>,
) {
  const { agent, isReady } = useAgent({ agentId });
  useEffect(() => {
    if (!isReady) return;
    const cur = agent.state ?? {};
    const missing = Object.fromEntries(
      Object.entries(initial).filter(([k]) => !(k in cur)),
    );
    if (Object.keys(missing).length) agent.setState({ ...cur, ...missing });
  }, [isReady]); // intentionally run once
}
```

⚠️ untested end-to-end: confirm the seeded value reaches Python on the next run.

### 4.5 Gotchas

1. **Whole-object replace** in `setState` — always spread.
2. **Schema first** on Python side (`preferences: dict`).
3. **Reducer echo-back warning:** if a state field uses a LangGraph reducer (e.g. list append), the browser sending the same list back can duplicate items. Prefer plain overwrite fields for shared state.
4. **Streaming partial state** from long Python nodes needs the state-streaming middleware / emitting intermediate state; otherwise you only see the final state.
5. Shared state is **not** context: context is one-way, snapshot-at-run-start, read-only for the agent.
6. Don't put big lists in shared state just to "show" them; for server-owned data use REST + React Query (§9).

### 4.6 Used in this POC?

No — the POC deliberately used context (todos) and REST (money). Shared state is documented here as the pattern to reach for when **both sides edit the same object** (e.g. a draft document, filters, preferences).

---

## 5. Custom chat messages

We never use `<CopilotChat>`/Sidebar/Popup; we render our own UI from the agent.

```tsx
const { agent } = useAgent({ agentId: "main_assistant" });
const { copilotkit } = useCopilotKit();

// read
agent.messages; // array of AG-UI messages: user, assistant, tool
agent.isRunning; // boolean (replaces isLoading)

// send
agent.addMessage({ id: crypto.randomUUID(), role: "user", content: text });
await copilotkit.runAgent({ agent });
```

**Seeing tool calls (the v1 `messages / toolCalls` doubt):** assistant messages carry `toolCalls` (each has `id`, `function.name`, `function.arguments` as a JSON string); results come back as `role: "tool"` messages with `toolCallId`. To _render_ a tool call as a nice card use `useRenderTool` (v1: `useRenderToolCall`).

**UI tips we used:** messages container is the only scrolling element; auto-scroll to the bottom on new messages; filter out `tool` messages from the bubbles; show "thinking…" while `isRunning`.

---

## 6. Frontend tools vs backend tools

|               | Frontend tool                                                                  | Backend tool                                          |
| ------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Defined       | in React (`useFrontendTool`)                                                   | in Python (LangGraph tool)                            |
| Runs          | **in the browser**                                                             | **on the server**                                     |
| Can touch     | React state, DOM, router                                                       | DB, files, other APIs                                 |
| Run lifecycle | model calls it → **run ends** → browser executes → **new run** with the result | executes inside the same run, loops back to the model |
| Secrets       | none safe                                                                      | safe                                                  |
| Our use       | todos (add/edit/delete/complete)                                               | money (5 tools)                                       |

```tsx
useFrontendTool(
  {
    name: "add_todo",
    description: "Add a todo item",
    parameters: z.object({ title: z.string() }),
    handler: async ({ title }) => {
      addTodo(title);
      return "added";
    },
  },
  [addTodo],
); // deps so the handler isn't stale
```

Rules we learned:

- Tool registered by a component **disappears when it unmounts** → tools are naturally page-scoped.
- The handler's return value is what the model sees next.
- Sub-agents invoked as tools run on the server and **cannot call browser tools**. That's why todos are _not_ inside a sub-agent.
- Use `parallel_tool_calls=False` so one assistant turn doesn't mix frontend and backend calls.

---

## 7. Context

```tsx
useAgentContext({ description: "Todos currently on screen", value: todos });
useAgentContext({ description: "Current page", value: pathname });
```

- **Read-only, one-way** (browser → agent). Cheap way to let it "see" the UI.
- **Snapshot at run start.** If a tool changes todos mid-run, the model doesn't see the new list until the next run.
- Replaces `useCopilotReadable`.

---

## 8. Multi-agent

```
main_assistant (single id for the UI)
   └─ supervisor (LangGraph graph)
        ├─ answers normal questions itself
        ├─ calls frontend tools (todo) — only present when the Todo page is mounted
        └─ ask_money_manager (backend tool) → run_money_agent
              └─ money sub-agent with 5 tools over an in-memory dict
```

- **Pattern chosen:** supervisor with sub-agent-as-tool (simple, and the UI keeps one agentId).
- **Alternatives:** router (pick an agent per message), or one big agent with all tools. Fewer moving parts vs. cleaner separation.
- Prompt trick: the supervisor prompt includes the todo section **only if** todo tools are present.
- `route()` decides the next node (see `PROJECT_REFERENCE.md`).

---

## 9. Refreshing UI after backend changes

Money data lives in a Python dict, exposed at `/api/money/*`, fetched with React Query.

```tsx
const { agent } = useAgent({ agentId: "main_assistant" });
const qc = useQueryClient();
const was = useRef(false);
useEffect(() => {
  if (was.current && !agent.isRunning)
    qc.invalidateQueries({ queryKey: ["money"] });
  was.current = agent.isRunning;
}, [agent.isRunning]);
```

- Optional: `refetchInterval` while running for live updates.
- **In-memory store facts:** wiped on server reload/restart, per-process (use a single worker), and different from LangGraph's `MemorySaver` (that stores conversation checkpoints, not your data). MongoDB design is left as commented code only.
- Should DB writes happen inside a tool? Yes for backend tools — the tool _is_ the safe place; just return a short result and let the UI re-fetch.

---

## 10. Layout

- `app/layout.tsx` → `<Suspense><Providers><AppShell>{children}</AppShell></Providers></Suspense>`
- `AppShell`: CSS grid `grid-cols-[7fr_3fr]` (70/30), nav, page content on the left, **one** `ChatPanel` on the right; only the messages list scrolls.
- Pages: `/` → Todos, `/money` → Money.
- Providers order: `QueryClientProvider` → `CopilotKit` → `TodosProvider`.

---

## 11. Cheat sheet

```
useCoAgent state            → useAgent().agent.state / setState
useCoAgent initialState     → effect + agent.setState when isReady
useCopilotReadable          → useAgentContext
useCopilotAction            → useFrontendTool
useCopilotChat (messages)   → useAgent().agent.messages
useCopilotChat (send)       → agent.addMessage + useCopilotKit().runAgent
useCopilotChat (isLoading)  → agent.isRunning
useRenderToolCall           → useRenderTool
CopilotRuntime              → @copilotkit/runtime/v2 runtime + HttpAgent map
LangGraphAgent              → LangGraphAGUIAgent (ag_ui_langgraph)
```

---

## 12. Debugging playbook

| You see                                          | Look at                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `/api/copilotkit/info` → `{"error":"Not found"}` | transport mismatch; `[[...slug]]` route; delete old `route.ts`      |
| `{"detail":"Not Found"}`                         | FastAPI hop: stale process, wrong path, `AGENT_BASE_URL` has a path |
| Agent not found / 404 on `/agent/X/run`          | `agent=` prop ≠ key in runtime `agents` map                         |
| Deprecation warnings                             | imports not from `/v2`                                              |
| Model "can't see" data                           | add `useAgentContext` or state                                      |
| Tool never called                                | tool unmounted (wrong page) or description/schema unclear           |
| UI stale after money change                      | invalidate on run end                                               |
| State key vanishes                               | missing in Python state class                                       |
| Data gone after reload                           | in-memory store                                                     |

Quick checks: `curl localhost:3000/api/copilotkit/info`, open `localhost:8000/docs`, browser Network tab for the run stream.

---

## 13. Exercises

1. Add a `theme` field to shared state and let the agent toggle it from Python.
2. Add a `priority` param to the todo tools and show it in the UI.
3. Render `add_todo` calls as cards with `useRenderTool`.
4. Add a `delete_expense` money tool and confirm the UI updates without a manual refresh.
5. Switch to a router pattern and compare behavior.
6. Replace the dict with MongoDB (design is commented in `money_store.py`).

---

## 14. Notes for AI assistants

- **Never** emit v1 APIs: `useCoAgent`, `useCopilotAction`, `useCopilotReadable`, `useCopilotChat`, v1 `CopilotRuntime`, `LangGraphAgent`.
- Import from `@copilotkit/react-core/v2` and `@copilotkit/runtime/v2`.
- The UI uses **one** agentId (`main_assistant`); do not add per-page agents.
- Do not use `<CopilotChat>`, Sidebar or Popup; the chat is custom in `ChatPanel`.
- Todos = frontend tools (browser state). Money = backend sub-agent + REST + React Query. Don't move todos into the backend.
- Keep `useSingleEndpoint={false}` and the `[[...slug]]` route together.
- Mark anything unverified as such; don't invent export names — check the installed package.

---

## 15. Glossary

- **AG-UI:** open protocol for streaming agent↔UI events.
- **Runtime:** server component that routes requests to agents.
- **HttpAgent:** runtime-side client that forwards runs to a remote AG-UI endpoint.
- **Run:** one agent execution (one stream).
- **Frontend tool:** tool executed in the browser.
- **Shared state:** JSON both sides can edit.
- **Context:** read-only info sent to the agent each run.
- **Supervisor:** the graph that delegates to tools/sub-agents.

---

## 16. Unverified / next steps

- Mixed todo+money requests and `parallel_tool_calls=False` with Groq.
- `UseAgentUpdate` import path; seeded initial state reaching Python.
- AppShell refactor and money run-end refetch under load.
- CopilotKit Cloud: not researched (any `publicApiKey` note was from memory).
- Obsolete file: `COPILOTKIT_POC_HANDOFF.md` can be deleted.
