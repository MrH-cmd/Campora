import { changePassword, resendVerification, updateProfile } from "@/app/actions/auth";
import { ActionButton, Field, Form, ImagePicker, Submit } from "@/components/form";
import { Badge, Card, LinkButton, PageHead, statusTone } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";

export const metadata = { title: "Account" };

export default async function Account({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const u = await requireUser("/account");
  const { welcome } = await searchParams;
  const unis = await asUser(u.id, (db) => db.rows("select id,name from universities where is_active order by name"));
  return (
    <>
      <PageHead title={welcome ? `Welcome, ${u.full_name.split(" ")[0]}` : "Your account"} sub={u.email} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">Getting set up</h2>
          <ul className="mt-2 space-y-3 text-sm">
            <li className="flex items-center justify-between gap-2"><span>Email</span>
              {u.email_verified_at ? <Badge tone="green">Verified</Badge> : <ActionButton action={resendVerification}>Resend link</ActionButton>}</li>
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
      </div>
    </>
  );
}
