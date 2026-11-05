import { resetPassword } from "@/app/actions/auth";
import { Field, Form, Submit } from "@/components/form";

export const metadata = { title: "New password" };
export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-bold">Choose a new password</h1>
      <Form action={resetPassword} className="mt-5 space-y-3">
        <input type="hidden" name="token" value={token ?? ""} />
        <Field label="New password" name="password" type="password" autoComplete="new-password" required />
        <Submit className="w-full">Save new password</Submit>
      </Form>
    </>
  );
}
