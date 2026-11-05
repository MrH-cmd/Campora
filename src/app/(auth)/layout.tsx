import Link from "next/link";
import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh md:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-white md:flex">
        <div className="absolute inset-0" style={{ background: "radial-gradient(70% 60% at 90% 0%, #1b6f58, transparent 65%)" }} aria-hidden />
        <Link href="/" className="relative"><Logo light /></Link>
        <p className="display relative max-w-md text-5xl font-bold leading-[1.02]">Buy. Sell. Discover. Connect. Grow.</p>
      </aside>
      <main className="flex items-center justify-center p-5">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 block md:hidden"><Logo /></Link>
          {children}
        </div>
      </main>
    </div>
  );
}
