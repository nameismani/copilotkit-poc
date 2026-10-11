"use client";
import { useState } from "react";
import { useMoney } from "../hooks/useMoney";
import { Kind } from "@/lib/moneyApi";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    n,
  );

export default function MoneyPanel() {
  const { transactions, summary, add, update, remove } = useMoney();
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");

  const s = summary.data;
  const rows = transactions.data ?? [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0 || !category.trim()) return;
    add.mutate({
      kind,
      amount: value,
      category: category.trim(),
      note: note.trim(),
    });
    setAmount("");
    setCategory("");
    setNote("");
  };

  if (transactions.isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-600">
          Could not reach the money API: {(transactions.error as Error).message}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-400">Income</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-emerald-600">
            {fmt(s?.income ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-400">Expense</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-rose-600">
            {fmt(s?.expense ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-400">Balance</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">
            {fmt(s?.balance ?? 0)}
          </p>
        </div>
      </div>

      {/* Category Pills */}
      {s && Object.keys(s.by_category).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(s.by_category).map(([cat, v]) => (
            <span
              key={cat}
              className="rounded-full border border-slate-100 bg-slate-50 px-3.5 py-1 text-xs font-medium text-slate-600 shadow-2xs"
            >
              {cat}: <strong className="text-slate-900">{fmt(v)}</strong>
            </span>
          ))}
        </div>
      )}

      {/* Add Transaction Form */}
      <form
        onSubmit={submit}
        className="flex flex-wrap gap-2.5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
      >
        <select
          className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
        <input
          className="w-28 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
          type="number"
          min="0"
          step="0.01"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className="w-32 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
          placeholder="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <input
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus:ring-2 focus:ring-slate-900/20 disabled:opacity-50"
          disabled={add.isPending}
        >
          Add
        </button>
      </form>

      {/* Transactions List */}
      <ul className="space-y-2.5">
        {rows.map((t) => (
          <li
            key={`${t.id}-${t.amount}-${t.category}-${t.note}`}
            className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-2xs transition hover:border-slate-200 hover:shadow-xs"
          >
            <span
              className={`w-16 rounded-md px-2 py-1 text-center text-xs font-semibold uppercase tracking-wider ${
                t.kind === "income"
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-rose-50 text-rose-600"
              }`}
            >
              {t.kind}
            </span>
            <input
              className="w-24 rounded-lg border border-slate-200 bg-slate-50/30 px-2.5 py-1 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500/20"
              type="number"
              step="0.01"
              defaultValue={t.amount}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v > 0 && v !== t.amount)
                  update.mutate({ id: t.id, patch: { amount: v } });
              }}
            />
            <input
              className="w-28 rounded-lg border border-slate-200 bg-slate-50/30 px-2.5 py-1 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500/20"
              defaultValue={t.category}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== t.category)
                  update.mutate({ id: t.id, patch: { category: v } });
              }}
            />
            <input
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50/30 px-2.5 py-1 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500/20"
              defaultValue={t.note}
              placeholder="note"
              onBlur={(e) => {
                if (e.target.value !== t.note)
                  update.mutate({ id: t.id, patch: { note: e.target.value } });
              }}
            />
            <span className="text-xs font-medium text-slate-400">{t.date}</span>
            <button
              onClick={() => remove.mutate(t.id)}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              title="Delete transaction"
            >
              ✕
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            No transactions yet. Try asking the assistant: &quot;spent 250 on
            lunch&quot;.
          </li>
        )}
      </ul>
    </div>
  );
}
