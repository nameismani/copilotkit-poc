"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
//
export type Todo = { id: string; text: string; completed: boolean };

type Store = {
  todos: Todo[];
  add: (text: string) => string;
  edit: (id: string, text: string) => void;
  remove: (id: string) => void;
  toggle: (id: string, completed?: boolean) => void;
};

const Ctx = createContext<Store | null>(null);

export function TodosProvider({ children }: { children: React.ReactNode }) {
  const [todos, setTodos] = useState<Todo[]>([]);

  const add = useCallback((text: string) => {
    const id = crypto.randomUUID();
    setTodos((p) => [...p, { id, text, completed: false }]);
    return id;
  }, []);
  const edit = useCallback(
    (id: string, text: string) =>
      setTodos((p) => p.map((t) => (t.id === id ? { ...t, text } : t))),
    [],
  );
  const remove = useCallback(
    (id: string) => setTodos((p) => p.filter((t) => t.id !== id)),
    [],
  );
  const toggle = useCallback(
    (id: string, completed?: boolean) =>
      setTodos((p) =>
        p.map((t) =>
          t.id === id ? { ...t, completed: completed ?? !t.completed } : t,
        ),
      ),
    [],
  );

  const value = useMemo(
    () => ({ todos, add, edit, remove, toggle }),
    [todos, add, edit, remove, toggle],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTodoStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useTodoStore must be used inside <TodosProvider>");
  return s;
}
