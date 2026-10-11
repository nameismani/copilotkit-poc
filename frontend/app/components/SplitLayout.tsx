"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ChatPanel from "./ChatPanel";

const LINKS = [
  { href: "/", label: "Todos" },
  { href: "/money", label: "Money" },
];

type Props = {
  agentId: string;
  chatTitle: string;
  chatPlaceholder?: string;
  onRunFinished?: () => void;
  children: React.ReactNode;
};

export default function SplitLayout({
  agentId,
  chatTitle,
  chatPlaceholder,
  onRunFinished,
  children,
}: Props) {
  const pathname = usePathname();

  return (
    <div className="grid h-screen grid-cols-[7fr_3fr] overflow-hidden">
      <main className="min-h-0 overflow-y-auto p-6">
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

      <aside className="min-h-0 border-l bg-white">
        <ChatPanel
          agentId={agentId}
          title={chatTitle}
          placeholder={chatPlaceholder}
          onRunFinished={onRunFinished}
        />
      </aside>
    </div>
  );
}
