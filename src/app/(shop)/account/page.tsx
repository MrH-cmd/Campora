import { changePassword, requestDeletion, resendVerification, updateProfile } from "@/app/actions/auth";
import { ActionButton, Field, Form, ImagePicker, Submit } from "@/components/form";
import { Badge, Card, LinkButton, PageHead, statusTone } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { emailEnabled } from "@/lib/email";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "Account" };

export default async function Account({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const u = await requireUser("/account");
  const { welcome } = await searchParams;
  const { unis, grace } = await asUser(u.id, async (db) => ({ unis: await db.rows("select id,name from universities where is_active order by name"), grace: await getSetting<number>(db, "deletion_grace_days", 7) }));
  return (
    <>
      <PageHead title={welcome ? `Welcome, ${u.full_name.split(" ")[0]}` : "Your account"} sub={u.email} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">Getting set up</h2>
          <ul className="mt-2 space-y-3 text-sm">
            <li className="flex items-center justify-between gap-2"><span>Email</span>
              {u.email_verified_at ? <Badge tone="green">Verified</Badge> : emailEnabled() ? <ActionButton action={resendVerification}>Resend link</ActionButton> : <Badge>Not required yet</Badge>}</li>
            <li className="flex items-center justify-between gap-2"><span>Student status</span>
              {u.student_status === "verified" ? <Badge tone="green">Verified</Badge> : <LinkButton size="sm" variant="outline" href="/account/verification">{u.student_status === "pending" ? "In review" : "Verify now"}</LinkButton>}</li>
            <li className="flex items-center justify-between gap-2"><span>Account</span><Badge tone={statusTone(u.status)}>{u.status}</Badge></li>
          </ul>
          {u.role === "customer" && <LinkButton href="/account/become-seller" className="mt-4" variant="dark" size="sm">Start selling</LinkButton>}
          {u.role === "seller" && <LinkButton href="/seller" className="mt-4" variant="dark" size="sm">Seller dashboard</LinkButton>}
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Profile</h2>
          <Form action={updateProfile} className="mt-2 space-y-3">
            <Field label="Full name" name="full_name" defaultValue={u.full_name} />
            <Field label="Phone" name="phone" type="tel" defaultValue={u.phone ?? ""} />
            <Field label="University" name="university_id" as="select" defaultValue={u.university_id ?? ""}>{unis.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Field>
            <label className="block text-sm font-medium">Profile photo<ImagePicker name="avatar" max={1} multiple={false} /></label>
            <Submit>Save profile</Submit>
          </Form>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Change password</h2>
          <Form action={changePassword} resetOnSuccess className="mt-2 space-y-3">
            <Field label="Current password" name="current" type="password" autoComplete="current-password" />
            <Field label="New password" name="password" type="password" autoComplete="new-password" />
            <Submit variant="outline">Change password</Submit>
          </Form>
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-coral">Delete My Account</h2>
          <details className="mt-1"><summary className="cursor-pointer text-sm font-medium">I want to delete my account</summary>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-mute">
              <li>Your account and dashboard become unavailable, and your storefront is hidden.</li>
              <li>Your profile, saved items, messages, student documents and unused reward credit are removed.</li>
              <li>Order and payment records are kept without your name, as financial law requires.</li>
              <li>Finish open orders, payouts and disputes first. You lose support on past orders.</li>
              <li>Log back in within {grace} days to cancel. After that it can't be undone.</li>
            </ul>
            <Form action={requestDeletion} className="mt-3 space-y-2">
              <Field label="Your password" name="password" type="password" autoComplete="current-password" />
              <Field label="Type DELETE to confirm" name="confirm" autoComplete="off" />
              <Submit variant="danger" confirm="Delete your account? This schedules permanent deletion.">Delete my account</Submit>
            </Form>
          </details>
        </Card>
      </div>
    </>
  );
}
