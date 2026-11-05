import { confirmStudentEmail } from "@/app/actions/auth";
import { LinkButton } from "@/components/ui";

export default async function V({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await confirmStudentEmail(token) : false;
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-3xl font-bold">{ok ? "You're a verified student" : "This link has expired"}</h1>
      <LinkButton href="/account/verification" className="mt-5">Continue</LinkButton>
    </div>
  );
}
