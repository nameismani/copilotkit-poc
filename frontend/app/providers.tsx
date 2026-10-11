"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CopilotKit } from "@copilotkit/react-core/v2";
import { TodosProvider } from "@/proivders/TodosProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // queries: { staleTime: 5_000, refetchOnWindowFocus: false },
          queries: { refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <CopilotKit
        runtimeUrl="/api/copilotkit"
        agent="main_assistant"
        useSingleEndpoint={false}
      >
        <TodosProvider>{children}</TodosProvider>
      </CopilotKit>
    </QueryClientProvider>
  );
}
