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

  // The agent sees the live list, so it can answer "how many todos?" itself.
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
