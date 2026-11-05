import { reviewVerification } from "@/app/actions/admin";
import { Field, Form, Submit } from "@/components/form";
import { Card, Empty, Img, PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { shortDate } from "@/lib/format";

export const metadata = { title: "Student checks" };
export default async function V() {
  const a = await requireAdmin();
  const rows = await asUser(a.id, (db) => db.rows(
    `select v.*, u.full_name, u.email, un.short_name from student_verifications v join users u on u.id=v.user_id join universities un on un.id=v.university_id
     where v.status='pending' and v.method='id_upload' order by v.created_at`));
  return (
    <>
      <PageHead title="Student checks" sub="Student-email checks confirm themselves. ID uploads wait here." />
      {rows.length === 0 ? <Empty title="No IDs waiting" /> : <div className="grid gap-3 md:grid-cols-2">{rows.map((v) => (
        <Card key={v.id}>
          <p className="font-semibold">{v.full_name}</p><p className="text-sm text-mute">{v.email}, {v.short_name}, matric {v.matric_number}, {shortDate(v.created_at)}</p>
          <a href={`/files/${v.document_path}`} target="_blank" rel="noreferrer"><Img path={v.document_path} alt="Student ID" className="mt-2 h-44 w-full rounded-lg" /></a>
          <Form action={reviewVerification} className="mt-2 space-y-2">
            <input type="hidden" name="id" value={v.id} />
            <Field label="Note to student" name="note" />
            <div className="flex gap-2">
              <label className="flex items-center gap-1 text-sm"><input type="radio" name="decision" value="approved" defaultChecked className="accent-palm" />Approve</label>
              <label className="flex items-center gap-1 text-sm"><input type="radio" name="decision" value="rejected" className="accent-palm" />Decline</label>
              <Submit size="sm" className="ml-auto">Save decision</Submit>
            </div>
          </Form>
        </Card>
      ))}</div>}
    </>
  );
}
