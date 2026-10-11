"use client";
import { CopilotKit } from "@copilotkit/react-core";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent="todo_agent">
      {children}
    </CopilotKit>
  );
}
