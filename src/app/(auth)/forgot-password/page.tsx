import Link from "next/link";
import { forgotPassword } from "@/app/actions/auth";
import { Field, Form, Submit } from "@/components/form";

export const metadata = { title: "Forgot password" };
export default function Forgot() {
  return (
    <>
      <h1 className="text-3xl font-bold">Reset your password</h1>
      <p className="mt-1 text-mute">We'll email you a link that lasts one hour.</p>
      <Form action={forgotPassword} className="mt-5 space-y-3">
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Submit className="w-full">Send reset link</Submit>
      </Form>
      <p className="mt-4 text-sm"><Link className="font-semibold underline" href="/login">Back to log in</Link></p>
    </>
  );
}
