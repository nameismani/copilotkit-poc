const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Kind = "income" | "expense";
export type Tx = {
  id: string;
  kind: Kind;
  amount: number;
  category: string;
  note: string;
  date: string;
};
export type Summary = {
  income: number;
  expense: number;
  balance: number;
  by_category: Record<string, number>;
};

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/money${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export const moneyApi = {
  list: () => http<Tx[]>("/transactions"),
  summary: () => http<Summary>("/summary"),
  add: (b: { kind: Kind; amount: number; category: string; note?: string }) =>
    http<Tx>("/transactions", { method: "POST", body: JSON.stringify(b) }),
  update: (id: string, patch: Partial<Omit<Tx, "id">>) =>
    http<Tx>(`/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  remove: (id: string) =>
    http<{ ok: boolean }>(`/transactions/${id}`, { method: "DELETE" }),
};
