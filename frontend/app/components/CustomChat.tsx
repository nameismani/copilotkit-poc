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
          return null; // tool results aren't shown
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
