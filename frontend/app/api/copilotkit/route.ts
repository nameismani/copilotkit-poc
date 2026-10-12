// v1 runtime route (CopilotKit 1.53, root imports).
// DELETE the old folder app/api/copilotkit/[[...slug]]/ before using this file.
import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { HttpAgent } from "@ag-ui/client";
import { NextRequest } from "next/server";

const base = "http://localhost:8000"; // http://localhost:8000 (host only, no path)

const runtime = new CopilotRuntime({
  agents: {
    // The KEY must match <CopilotKit agent="main_assistant">
    main_assistant: new HttpAgent({ url: `${base}/copilotkit` }),
  },
});

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new ExperimentalEmptyAdapter(), // LLM (Groq) runs in Python
    endpoint: "/api/copilotkit",
  });
  return handleRequest(req);
};
