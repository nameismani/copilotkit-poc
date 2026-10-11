"use client";
import { CopilotKit } from "@copilotkit/react-core/v2";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent="todo_agent">
      {children}
    </CopilotKit>
  );
}
