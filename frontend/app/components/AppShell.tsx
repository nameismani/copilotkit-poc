"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAgentContext } from "@copilotkit/react-core/v2";
import ChatPanel from "./ChatPanel";

const LINKS = [
  { href: "/", label: "Todos" },
  { href: "/money", label: "Money" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const qc = useQueryClient();

  // Tell the agent which page the user is on (one place for every page)
  useAgentContext({
    description: "The page the user is currently on.",
    value:
      pathname === "/"
        ? "Todos page. The todo tools are available here."
        : "Money page. The todo list is not available here.",
  });

  return (
    <div className="grid h-screen grid-cols-[7fr_3fr] overflow-hidden">
      {/* 70%: the current page */}
      <main className="min-h-0 min-w-0 overflow-y-auto p-6">
        <nav className="mb-6 flex gap-2 border-b">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-4 py-2 text-sm font-medium ${
                pathname === l.href
                  ? "border-b-2 border-black"
                  : "text-gray-500 hover:text-black"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        {children}
      </main>

      {/* 30%: ONE chat for the whole app, mounted once, never remounts on navigation */}
      <aside className="min-h-0 min-w-0 border-l bg-white">
        <ChatPanel
          agentId="main_assistant"
          title="Assistant"
          placeholder='Try: "add todo buy milk" or "spent 250 on lunch"'
          // The agent can change money data from any page, so refresh it after every run
          //   onRunFinished={() => qc.invalidateQueries({ queryKey: ["money"] })}
        />
      </aside>
    </div>
  );
}
