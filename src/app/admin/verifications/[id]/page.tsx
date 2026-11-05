import { notFound } from "next/navigation";
import { reviewVerification } from "@/app/actions/admin";
import { Field, Form, Submit } from "@/components/form";
import { Badge, Card, Img, PageHead, statusTone } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Review student" };
export default async function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await requireAdmin();
  const d = await asUser(a.id, async (db) => {
    const v = await db.one(
      `select v.*, u.full_name account_name, u.email, un.name university from student_verifications v join users u on u.id=v.user_id join universities un on un.id=v.university_id where v.id=$1`, [id]).catch(() => null);
    return v ? { v, history: await db.rows("select r.*, u.full_name from verification_reviews r left join users u on u.id=r.admin_id where r.verification_id=$1 order by r.created_at desc", [id]) } : null;
  });
  if (!d) notFound();
  const { v } = d;
  const pdf = v.document_path?.endsWith(".pdf");
  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2"><PageHead title={v.full_name ?? v.account_name} sub={v.email} action={<Badge tone={statusTone(v.status)}>{v.status}</Badge>} /></div>
      <Card>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {[["University", v.university], ["Department", v.department], ["Level", v.academic_level], ["Matric number", v.matric_number], ["Account name", v.account_name], ["Student email", v.student_email], ["Submitted", dateTime(v.created_at)]].map(([k, val]) => <div key={k}><dt className="text-mute">{k}</dt><dd>{val ?? "Not given"}</dd></div>)}
        </dl>
        {v.document_path && (pdf ? <a className="mt-3 inline-block font-semibold text-palm-deep underline" href={`/files/${v.document_path}`} target="_blank" rel="noreferrer">Open the PDF</a>
          : <a href={`/files/${v.document_path}`} target="_blank" rel="noreferrer"><Img path={v.document_path} alt="Student document" className="mt-3 max-h-80 w-full rounded-lg" /></a>)}
      </Card>
      <Card>
        {v.status === "pending" && (
          <Form action={reviewVerification} className="space-y-2">
            <input type="hidden" name="id" value={v.id} />
            <Field label="Decision" name="decision" as="select"><option value="approved">Approve</option><option value="rejected">Reject</option><option value="needs_info">Ask for more information</option></Field>
            <Field label="Message to the student" name="note" as="textarea" rows={3} hint="Required when rejecting or asking for more." />
            <Submit>Save decision</Submit>
          </Form>
        )}
        <Form action={reviewVerification} resetOnSuccess className="mt-4 space-y-2 border-t border-line pt-3">
          <input type="hidden" name="id" value={v.id} /><input type="hidden" name="decision" value="note" />
          <Field label="Internal note (the student never sees this)" name="note" defaultValue={v.internal_note ?? ""} />
          <Submit size="sm" variant="outline">Save note</Submit>
        </Form>
        <h2 className="mt-4 font-bold">History</h2>
        <ul className="text-sm">{d.history.map((h) => <li key={h.id} className="py-1">{h.full_name}: {h.decision}{h.reason ? `, ${h.reason}` : ""} <span className="text-xs text-mute">{dateTime(h.created_at)}</span></li>)}</ul>
      </Card>
    </div>
  );
}
