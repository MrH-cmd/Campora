import { redirect } from "next/navigation";
import { applyForSeller } from "@/app/actions/auth";
import { Field, Form, Submit } from "@/components/form";
import { Badge, Card, LinkButton, PageHead, statusTone } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";

export const metadata = { title: "Start selling" };
export default async function Become() {
  const u = await requireUser("/account/become-seller");
  if (u.role === "seller") redirect("/seller");
  const app = await asUser(u.id, (db) => db.one("select * from seller_profiles where user_id=$1", [u.id]));
  const ready = !!u.email_verified_at && u.student_status === "verified";
  return (
    <div className="max-w-xl">
      <PageHead title="Open your storefront" sub="Tell us about your business. An admin reviews every application." />
      {!ready && (
        <Card className="mb-4"><p className="font-semibold">Before you apply</p>
          <ul className="mt-1 list-inside list-disc text-sm text-mute">
            {!u.email_verified_at && <li>Verify your email from the link we sent you</li>}
            {u.student_status !== "verified" && <li>Verify your student status</li>}
          </ul>
          {u.student_status !== "verified" && <LinkButton size="sm" className="mt-3" href="/account/verification">Verify student status</LinkButton>}
        </Card>
      )}
      {app && app.status !== "rejected" ? (
        <Card><p className="flex items-center gap-2 font-semibold">{app.business_name}<Badge tone={statusTone(app.status)}>{app.status}</Badge></p><p className="mt-1 text-sm text-mute">We'll notify you when it's reviewed.</p></Card>
      ) : (
        <Card>
          {app?.review_note && <p className="mb-3 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">Last review: {app.review_note}</p>}
          <Form action={applyForSeller} className="space-y-3">
            <Field label="Business name" name="business_name" defaultValue={app?.business_name} />
            <Field label="What do you sell?" name="business_type" placeholder="Custom sneakers, catering, photography" defaultValue={app?.business_type} />
            <Field label="Tell us about it" name="pitch" as="textarea" rows={4} defaultValue={app?.pitch} />
            <Submit>Send application</Submit>
          </Form>
        </Card>
      )}
    </div>
  );
}
