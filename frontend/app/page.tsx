"use client";
import { useTodos } from "./hooks/useTodos";
import TodoPanel from "./components/TodoPanel";

export default function TodosPage() {
  const todos = useTodos(); // registers the browser todo tools while this page is mounted

  return (
    <>
      <h1 className="mb-4 text-xl font-bold">Todos</h1>
      <TodoPanel {...todos} />
    </>
  );
}
