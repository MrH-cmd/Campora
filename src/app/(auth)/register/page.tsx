import Link from "next/link";
import { register } from "@/app/actions/auth";
import { Field, Form, Submit } from "@/components/form";
import { asUser } from "@/lib/db";

export const metadata = { title: "Create account" };

export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const p = await searchParams;
  const unis = await asUser(null, (db) => db.rows("select id,name from universities where is_active order by name"));
  return (
    <>
      <h1 className="text-3xl font-bold">Join Campora</h1>
      <p className="mt-1 text-mute">Buy from students now. Apply to sell whenever you're ready.</p>
      <Form action={register} className="mt-5 space-y-3">
        <input type="hidden" name="next" value={p.next ?? ""} />
        <Field label="Full name" name="full_name" autoComplete="name" required />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="University" name="university_id" as="select" required>{unis.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Field>
        <Field label="Password" name="password" type="password" autoComplete="new-password" hint="At least 8 characters." required />
        <Submit className="w-full">Create account</Submit>
      </Form>
      <p className="mt-4 text-sm text-mute">Already joined? <Link className="font-semibold text-ink underline" href="/login">Log in</Link></p>
    </>
  );
}
