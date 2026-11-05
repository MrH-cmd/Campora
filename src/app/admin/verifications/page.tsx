import Link from "next/link";
import { Badge, Empty, PageHead, statusTone, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { shortDate } from "@/lib/format";

export const metadata = { title: "Student Verification Management" };
export default async function V({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "pending" } = await searchParams;
  const a = await requireAdmin();
  const rows = await asUser(a.id, (db) => db.rows(
    `select v.*, u.full_name account_name, u.email, un.short_name from student_verifications v join users u on u.id=v.user_id join universities un on un.id=v.university_id
     where ($1='pending' and v.status='pending') or ($1='reviewed' and v.status<>'pending') order by v.created_at desc limit 100`, [tab]));
  return (
    <>
      <PageHead title="Student Verification Management" />
      <div className="mb-4 flex gap-1">{[["pending", "Pending"], ["reviewed", "Reviewed"]].map(([k, l]) => <Link key={k} href={`/admin/verifications?tab=${k}`} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${tab === k ? "bg-panel-2 text-white" : "border border-line"}`}>{l}</Link>)}</div>
      {rows.length === 0 ? <Empty title="Nothing here" /> : (
        <Table head={["Student", "University", "Department", "Method", "Submitted", "Status"]}>
          {rows.map((v) => <tr key={v.id}><Td><Link className="font-medium text-palm-deep" href={`/admin/verifications/${v.id}`}>{v.full_name ?? v.account_name}</Link><p className="text-xs text-mute">{v.email}</p></Td><Td>{v.short_name}</Td><Td>{v.department}</Td><Td>{v.method === "id_upload" ? "Document" : "Student email"}</Td><Td>{shortDate(v.created_at)}</Td><Td><Badge tone={statusTone(v.status)}>{v.status}</Badge></Td></tr>)}
        </Table>
      )}
    </>
  );
}
