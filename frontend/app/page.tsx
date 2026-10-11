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
