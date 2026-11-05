import Link from "next/link";
import { login } from "@/app/actions/auth";
import { Field, Form, Submit } from "@/components/form";

export const metadata = { title: "Log in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string; deleted?: string }> }) {
  const p = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-bold">Welcome back</h1>
      {p.deleted && <p className="mt-2 rounded-lg bg-mint px-3 py-2 text-sm">Your account is scheduled for deletion. Log in before then to cancel it.</p>}
      {p.reset && <p className="mt-2 rounded-lg bg-mint px-3 py-2 text-sm">Password changed. Log in with the new one.</p>}
      <Form action={login} className="mt-5 space-y-3">
        <input type="hidden" name="next" value={p.next ?? ""} />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <Submit className="w-full">Log in</Submit>
      </Form>
      <p className="mt-4 text-sm text-mute"><Link className="font-semibold text-ink underline" href="/forgot-password">Forgot password?</Link></p>
      <p className="mt-1 text-sm text-mute">New here? <Link className="font-semibold text-ink underline" href={`/register${p.next ? `?next=${encodeURIComponent(p.next)}` : ""}`}>Create an account</Link></p>
    </>
  );
}
