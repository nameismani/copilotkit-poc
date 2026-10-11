"use client";
import { useState } from "react";
import { useCopilotChat } from "@copilotkit/react-core";
import { TextMessage, Role } from "@copilotkit/runtime-client-gql";

export default function CustomChat() {
  const chat: any = useCopilotChat();
  const [input, setInput] = useState("");

  // Temporary: shows what your version actually returns
  console.log("useCopilotChat keys:", Object.keys(chat));

  const messages: any[] = chat.visibleMessages ?? chat.messages ?? [];
  const isLoading: boolean = chat.isLoading ?? false;

  const send = () => {
    const text = input.trim();
    if (!text || isLoading) return;

    if (typeof chat.sendMessage === "function") {
      chat.sendMessage({
        id: crypto.randomUUID(),
        role: "user",
        content: text,
      });
    } else {
      chat.appendMessage(new TextMessage({ role: Role.User, content: text }));
    }
    setInput("");
  };

  const textMessages = messages.filter(
    (m) =>
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content,
  );

  return (
    <div className="flex h-full flex-col rounded-xl border">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {textMessages.map((m, i) => (
          <div
            key={m.id ?? i}
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-blue-600 text-white"
                : "bg-gray-100 text-gray-900"
            }`}
          >
            {m.content}
          </div>
        ))}
        {isLoading && <div className="text-xs text-gray-400">Thinking…</div>}
      </div>
      <div className="flex gap-2 border-t p-3">
        <input
          className="flex-1 rounded border px-3 py-2 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder='Try: "add buy milk" or "mark milk as done"'
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
