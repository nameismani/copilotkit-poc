"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CopilotKit } from "@copilotkit/react-core"; // v1 root import
import { TodosProvider } from "@/proivders/TodosProvider"; // fix to "providers" if you rename the folder

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <CopilotKit runtimeUrl="/api/copilotkit" agent="main_assistant">
        <TodosProvider>{children}</TodosProvider>
      </CopilotKit>
    </QueryClientProvider>
  );
}
