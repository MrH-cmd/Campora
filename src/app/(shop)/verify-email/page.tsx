import { confirmEmail } from "@/app/actions/auth";
import { LinkButton } from "@/components/ui";

export default async function V({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await confirmEmail(token) : false;
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-3xl font-bold">{ok ? "Email verified" : "This link has expired"}</h1>
      <p className="mt-2 text-mute">{ok ? "You can place orders now." : "Request a new link from your account page."}</p>
      <LinkButton href="/account" className="mt-5">Go to your account</LinkButton>
    </div>
  );
}
