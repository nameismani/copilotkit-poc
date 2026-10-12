"use client";
import { useCopilotAction, useCopilotReadable } from "@copilotkit/react-core"; // v1
import { useTodoStore, type Todo } from "@/proivders/TodosProvider";

export type { Todo };

// Registers the browser tools for the agent; they disappear when the page unmounts.
export function useTodos() {
  const store = useTodoStore();
  const { todos, add, edit, remove, toggle } = store;

  useCopilotReadable({
    description:
      "The user's current todo list. Each item has id, text, completed (true = done). Total count is included.",
    value: {
      total: todos.length,
      completedCount: todos.filter((t) => t.completed).length,
      todos,
    },
  });

  useCopilotAction({
    name: "add_todo",
    description: "Add a new todo task to the list",
    parameters: [
      {
        name: "text",
        type: "string",
        description: "The task text",
        required: true,
      },
    ],
    handler: async ({ text }) => ({ status: "added", id: add(text), text }),
  });

  useCopilotAction({
    name: "edit_todo",
    description: "Change the text of an existing todo, found by its id",
    parameters: [
      {
        name: "id",
        type: "string",
        description: "Id of the todo",
        required: true,
      },
      {
        name: "text",
        type: "string",
        description: "The new text",
        required: true,
      },
    ],
    handler: async ({ id, text }) => {
      edit(id, text);
      return { status: "updated", id, text };
    },
  });

  useCopilotAction({
    name: "delete_todo",
    description: "Delete a todo by its id",
    parameters: [
      {
        name: "id",
        type: "string",
        description: "Id of the todo",
        required: true,
      },
    ],
    handler: async ({ id }) => {
      remove(id);
      return { status: "deleted", id };
    },
  });

  useCopilotAction({
    name: "toggle_todo",
    description: "Mark a todo as completed or not completed",
    parameters: [
      {
        name: "id",
        type: "string",
        description: "Id of the todo",
        required: true,
      },
      {
        name: "completed",
        type: "boolean",
        description: "true = completed, false = not completed",
        required: true,
      },
    ],
    handler: async ({ id, completed }) => {
      toggle(id, completed);
      return { status: "toggled", id, completed };
    },
  });

  return store;
}
