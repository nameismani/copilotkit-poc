"use client";
import { useState } from "react";
import { useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";

export type Todo = { id: string; text: string; completed: boolean };

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);

  // Manual operations (used by the UI buttons)
  const add = (text: string) =>
    setTodos((p) => [
      ...p,
      { id: crypto.randomUUID(), text, completed: false },
    ]);
  const edit = (id: string, text: string) =>
    setTodos((p) => p.map((t) => (t.id === id ? { ...t, text } : t)));
  const remove = (id: string) => setTodos((p) => p.filter((t) => t.id !== id));
  const toggle = (id: string, completed?: boolean) =>
    setTodos((p) =>
      p.map((t) =>
        t.id === id ? { ...t, completed: completed ?? !t.completed } : t,
      ),
    );

  // Give the agent the current list (with ids)
  useCopilotReadable({
    description: "The current todo list. Each item has id, text, completed.",
    value: todos,
  });

  // Agent-callable actions
  useCopilotAction({
    name: "add_todo",
    description: "Add a new todo task",
    parameters: [
      {
        name: "text",
        type: "string",
        description: "Task text",
        required: true,
      },
    ],
    handler: ({ text }) => {
      add(text);
      return `Added "${text}"`;
    },
  });

  useCopilotAction({
    name: "edit_todo",
    description: "Change the text of an existing todo",
    parameters: [
      { name: "id", type: "string", description: "Todo id", required: true },
      { name: "text", type: "string", description: "New text", required: true },
    ],
    handler: ({ id, text }) => {
      edit(id, text);
      return "Updated";
    },
  });

  useCopilotAction({
    name: "delete_todo",
    description: "Delete a todo by id",
    parameters: [
      { name: "id", type: "string", description: "Todo id", required: true },
    ],
    handler: ({ id }) => {
      remove(id);
      return "Deleted";
    },
  });

  useCopilotAction({
    name: "toggle_todo",
    description: "Mark a todo completed or not completed",
    parameters: [
      { name: "id", type: "string", description: "Todo id", required: true },
      {
        name: "completed",
        type: "boolean",
        description: "true = completed",
        required: true,
      },
    ],
    handler: ({ id, completed }) => {
      toggle(id, completed);
      return "Toggled";
    },
  });

  return { todos, add, edit, remove, toggle };
}
