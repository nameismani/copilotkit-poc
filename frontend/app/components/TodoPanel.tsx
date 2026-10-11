"use client";
import { useState } from "react";
import type { Todo } from "../hooks/useTodos";

type Props = {
  todos: Todo[];
  add: (text: string) => string;
  edit: (id: string, text: string) => void;
  remove: (id: string) => void;
  toggle: (id: string, completed?: boolean) => void;
};

export default function TodoPanel({ todos, add, edit, remove, toggle }: Props) {
  const [text, setText] = useState("");
  return (
    <div>
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
          <li key={t.id} className="flex items-center gap-2 rounded border p-2">
            <input
              type="checkbox"
              checked={t.completed}
              onChange={() => toggle(t.id)}
            />
            <input
              className={`flex-1 bg-transparent ${t.completed ? "text-gray-400 line-through" : ""}`}
              value={t.text}
              onChange={(e) => edit(t.id, e.target.value)}
            />
            <button onClick={() => remove(t.id)} className="text-red-500">
              ✕
            </button>
          </li>
        ))}
        {todos.length === 0 && (
          <li className="text-sm text-gray-400">No todos yet.</li>
        )}
      </ul>
    </div>
  );
}
