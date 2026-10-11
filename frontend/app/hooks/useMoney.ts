"use client";
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";
import { moneyApi, type Tx } from "@/lib/moneyApi";

export const MONEY_KEY = ["money"] as const;

export function useMoney() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: MONEY_KEY });

  // Re-render only when the run status changes, not on every streamed token
  const { agent } = useAgent({
    agentId: "main_assistant",
    updates: [UseAgentUpdate.OnRunStatusChanged],
  });
  const isRunning = agent.isRunning;

  // Refetch once when a run finishes (running -> idle)
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !isRunning) refresh();
    wasRunning.current = isRunning;
  }, [isRunning]);

  // Optional: poll every second only while the agent is running (live rows).
  // Delete both refetchInterval lines if you only want the refresh at the end.
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
