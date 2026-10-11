"use client";
import { useEffect, useRef, useState } from "react";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";

type Props = {
  agentId: string;
  title: string;
  placeholder?: string;
  onRunFinished?: () => void; // fires when an agent run goes running -> idle
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
  //   const wasRunning = useRef(false);

  const messages: any[] = agent.messages ?? [];
  const last = messages[messages.length - 1];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [
    messages.length,
    typeof last?.content === "string" ? last.content.length : 0,
    agent.isRunning,
  ]);

  //   useEffect(() => {
  //     if (wasRunning.current && !agent.isRunning) onRunFinished?.();
  //     wasRunning.current = agent.isRunning;
  //   }, [agent.isRunning]);

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
          return null;
        })}
        {agent.isRunning && (
          <div className="text-xs text-gray-400">Thinking…</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t p-3">
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={placeholder ?? "Type a message…"}
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
