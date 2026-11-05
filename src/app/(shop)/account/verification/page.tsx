import { submitIdUpload, submitStudentEmail } from "@/app/actions/auth";
import { Field, Form, ImagePicker, Submit } from "@/components/form";
import { Badge, Card, PageHead, statusTone } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { emailEnabled } from "@/lib/email";
import { shortDate } from "@/lib/format";

export const metadata = { title: "Student verification" };
export default async function Verify() {
  const u = await requireUser("/account/verification");
  const d = await asUser(u.id, async (db) => ({
    uni: await db.one("select * from universities where id=$1", [u.university_id]),
    history: await db.rows("select * from student_verifications where user_id=$1 order by created_at desc limit 5", [u.id]),
  }));
  const methods: string[] = d.uni?.verification_methods ?? [];
  return (
    <>
      <PageHead title="Student verification" sub={`${d.uni?.name ?? "No university chosen"}. Verified students can apply to sell.`} action={<Badge tone={statusTone(u.student_status)}>{u.student_status}</Badge>} />
      {u.student_status !== "verified" && (
        <div className="grid gap-4 md:grid-cols-2">
          {methods.includes("student_email") && emailEnabled() && (
            <Card>
              <h2 className="text-lg font-bold">Use your student email</h2>
              <p className="text-sm text-mute">Fastest option. We send a link to your {d.uni.student_email_domains.join(" or ")} address.</p>
              <Form action={submitStudentEmail} className="mt-3 space-y-3">
                <Field label="Student email" name="student_email" type="email" />
                <Submit>Send confirmation</Submit>
              </Form>
            </Card>
          )}
          {methods.includes("id_upload") && (
            <Card>
              <h2 className="text-lg font-bold">Upload your student ID</h2>
              <p className="text-sm text-mute">An admin checks it by hand. Only admins can see this photo.</p>
              <Form action={submitIdUpload} className="mt-3 space-y-3">
                <Field label="Matric number" name="matric_number" />
                <label className="block text-sm font-medium">Student ID photo<ImagePicker name="document" max={1} multiple={false} /></label>
                <Submit variant="outline">Submit for review</Submit>
              </Form>
            </Card>
          )}
        </div>
      )}
      {d.history.length > 0 && (
        <Card className="mt-4"><h2 className="font-bold">History</h2>
          <ul className="mt-2 divide-y divide-line text-sm">{d.history.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 py-2"><span>{h.method === "student_email" ? "Student email" : "ID upload"}, {shortDate(h.created_at)}{h.review_note ? `: ${h.review_note}` : ""}</span><Badge tone={statusTone(h.status)}>{h.status}</Badge></li>
          ))}</ul>
        </Card>
      )}
    </>
  );
}
