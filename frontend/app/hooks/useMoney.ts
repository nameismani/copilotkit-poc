"use client";
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCoAgent } from "@copilotkit/react-core"; // v1 (v2: useAgent)
import { moneyApi, type Tx } from "@/lib/moneyApi";

export const MONEY_KEY = ["money"] as const;

export function useMoney() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: MONEY_KEY });

  // v1: "is the agent running?"  (UNTESTED: if useCoAgent causes odd state syncing, use
  //   const { isLoading: isRunning } = useCopilotChatHeadless_c();  instead)
  const { running: isRunning, state } = useCoAgent({ name: "main_assistant" });
  console.log(state, "messaages", state?.messaages);
  // Refetch once when a run finishes (running -> idle)
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !isRunning) refresh();
    wasRunning.current = isRunning;
  }, [isRunning]);

  // Poll every second only while the agent is running (remove to refresh only at the end)
  const poll = isRunning ? 1000 : false;

  const transactions = useQuery({
    queryKey: [...MONEY_KEY, "transactions"],
    queryFn: moneyApi.list,
    refetchInterval: poll,
  });
  const summary = useQuery({
    queryKey: [...MONEY_KEY, "summary"],
    queryFn: moneyApi.summary,
    refetchInterval: poll,
  });

  const add = useMutation({ mutationFn: moneyApi.add, onSuccess: refresh });
  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Omit<Tx, "id">>;
    }) => moneyApi.update(id, patch),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: moneyApi.remove,
    onSuccess: refresh,
  });

  return { transactions, summary, add, update, remove };
}
