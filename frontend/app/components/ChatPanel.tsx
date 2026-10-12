// app/components/ChatPanel.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useCoAgent, useCopilotChat } from "@copilotkit/react-core";
import { TextMessage, Role } from "@copilotkit/runtime-client-gql";

type Props = { agentId: string; title: string; placeholder?: string };

type Row =
  | { key: string; kind: "user" | "assistant" | "error"; text: string }
  | { key: string; kind: "tool"; name: string; args: string; callId: string };

function textOf(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((b) => (typeof b === "string" ? b : (b?.text ?? "")))
      .join("");
  return "";
}
const roleOf = (m: any) => String(m?.type ?? m?.role ?? "").toLowerCase();

// Agent messages -> rows (user messages are skipped: we own those) + finished tool call ids
function convert(raw: any[]) {
  const rows: Row[] = [];
  const done: string[] = [];

  raw.forEach((m, i) => {
    const id = String(m.id ?? `idx-${i}`);
    const t = roleOf(m);

    if (t === "tool") {
      const cid = m.tool_call_id ?? m.toolCallId;
      if (cid) done.push(String(cid));
      return;
    }
    if (t === "ai" || t === "assistant") {
      const calls: any[] = m.tool_calls ?? m.toolCalls ?? [];
      calls.forEach((c, j) => {
        const callId = String(c.id ?? `${id}-${j}`);
        const a = c.args ?? c.function?.arguments ?? {};
        rows.push({
          key: `${id}:${callId}`,
          kind: "tool",
          name: c.name ?? c.function?.name ?? "tool",
          args: typeof a === "string" ? a : JSON.stringify(a),
          callId,
        });
      });
      const text = textOf(m.content);
      if (text) rows.push({ key: id, kind: "assistant", text });
    }
  });
  return { rows, done };
}

// Add new rows at the end, update existing ones in place, NEVER remove
function merge(prev: Row[], incoming: Row[]): Row[] {
  const index = new Map(prev.map((r, i) => [r.key, i]));
  let next = prev;
  let changed = false;

  for (const r of incoming) {
    const at = index.get(r.key);
    if (at === undefined) {
      if (!changed) next = [...prev];
      changed = true;
      index.set(r.key, next.length);
      next.push(r);
    } else {
      const old = next[at];
      // don't let an empty/shorter snapshot overwrite text we already have
      if (
        r.kind === "assistant" &&
        old.kind === "assistant" &&
        r.text.length < old.text.length
      )
        continue;
      if (JSON.stringify(old) === JSON.stringify(r)) continue;
      if (!changed) next = [...prev];
      changed = true;
      next[at] = r;
    }
  }
  return changed ? next : prev;
}

export default function ChatPanel({ agentId, title, placeholder }: Props) {
  const co = useCoAgent<{ messages?: any[] }>({ name: agentId });
  const { appendMessage } = useCopilotChat();

  // Everything lives here. It only grows.
  const [log, setLog] = useState<Row[]>([]);
  const [finished, setFinished] = useState<Set<string>>(new Set());

  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const busy = sending || co.running;

  // Copy agent messages into our own log whenever the agent state changes
  useEffect(() => {
    const raw = co.state?.messages;
    if (!raw?.length) return; // empty snapshot: keep what we have
    const { rows, done } = convert(raw);
    setLog((prev) => merge(prev, rows));
    if (done.length)
      setFinished((prev) => {
        if (done.every((d) => prev.has(d))) return prev;
        return new Set([...prev, ...done]);
      });
  }, [co.state?.messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log.length, log[log.length - 1]?.key, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setLog((p) => [
      ...p,
      { key: `u-${crypto.randomUUID()}`, kind: "user", text },
    ]);
    setSending(true);
    try {
      await appendMessage(new TextMessage({ role: Role.User, content: text }));
    } catch (err: any) {
      console.error(`[${agentId}] send failed`, err);
      setLog((p) => [
        ...p,
        {
          key: `e-${crypto.randomUUID()}`,
          kind: "error",
          text: err?.message ?? "Request failed",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const clearChat = () => {
    setLog([]);
    setFinished(new Set());
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-gray-500">agent: {agentId}</p>
        </div>
        <button
          onClick={clearChat}
          className="text-xs text-gray-500 hover:text-black"
        >
          Clear
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {log.length === 0 && (
          <p className="text-sm text-gray-400">
            {placeholder ?? "Ask me anything…"}
          </p>
        )}
        {log.map((r) => {
          if (r.kind === "user")
            return (
              <div
                key={r.key}
                className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
              >
                {r.text}
              </div>
            );
          if (r.kind === "assistant")
            return (
              <div
                key={r.key}
                className="w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900"
              >
                {r.text}
              </div>
            );
          if (r.kind === "error")
            return (
              <div
                key={r.key}
                className="w-fit max-w-[85%] rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
              >
                {r.text}
              </div>
            );
          const done = finished.has(r.callId) || !busy; // when the run is over, treat calls as done
          return (
            <div
              key={r.key}
              className="w-fit max-w-[85%] break-words rounded border bg-white px-2 py-1 text-xs text-gray-600"
            >
              {done ? "✓" : "⚙"} <b>{r.name}</b>
              <div className="truncate text-gray-400">{r.args}</div>
            </div>
          );
        })}
        {busy && <div className="text-xs text-gray-400">Thinking…</div>}
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
            disabled={busy}
          />
          <button
            onClick={send}
            disabled={busy}
            className="rounded bg-blue-600 px-4 text-sm text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
