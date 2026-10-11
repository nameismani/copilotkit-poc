"use client";
import { useFrontendTool, useAgentContext } from "@copilotkit/react-core/v2";
import { z } from "zod";
import { useTodoStore, type Todo } from "@/proivders/TodosProvider";

export type { Todo };

// Call this ONLY on the Todos page: it registers the browser tools for the agent
// and removes them again when the page unmounts.
export function useTodos() {
  const store = useTodoStore();
  const { todos, add, edit, remove, toggle } = store;

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

  return store;
}
