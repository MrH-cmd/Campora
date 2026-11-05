import { requireUser } from "@/lib/auth";
export default async function L({ children }: { children: React.ReactNode }) { await requireUser("/messages"); return <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>; }
