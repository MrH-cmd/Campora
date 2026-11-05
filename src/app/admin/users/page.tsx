import { setUserStatus } from "@/app/actions/admin";
import { ActionButton } from "@/components/form";
import { Badge, buttonClass, PageHead, Pager, statusTone, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { shortDate } from "@/lib/format";

export const metadata = { title: "Users" };
export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const p = await searchParams;
  const a = await requireAdmin();
  const page = Math.max(1, Number(p.page) || 1);
  const q = p.q?.trim() ?? "";
  const rows = await asUser(a.id, (db) => db.rows(
    `select u.id,u.full_name,u.email,u.role,u.status,u.student_status,u.created_at,u.is_sample, (select count(*)::int from orders o where o.buyer_id=u.id) order_count from users u
     where $1='' or u.full_name ilike '%'||$1||'%' or u.email ilike '%'||$1||'%' order by u.created_at desc limit 31 offset $2`, [q, (page - 1) * 30]));
  return (
    <>
      <PageHead title="Users" />
      <form className="mb-4 flex max-w-md gap-2"><input name="q" defaultValue={q} placeholder="Search name or email" aria-label="Search users" className="input" /><button className={buttonClass("dark")}>Search</button></form>
      <Table head={["User", "Role", "Student", "Status", "Joined", "Orders", "Actions"]}>
        {rows.slice(0, 30).map((u) => (
          <tr key={u.id}>
            <Td><p className="font-medium">{u.full_name}{u.is_sample && <span className="ml-1 text-xs text-mute">(sample)</span>}</p><p className="text-xs text-mute">{u.email}</p></Td>
            <Td className="capitalize">{u.role}</Td><Td><Badge tone={statusTone(u.student_status)}>{u.student_status}</Badge></Td><Td><Badge tone={statusTone(u.status)}>{u.status}</Badge></Td><Td>{shortDate(u.created_at)}</Td><Td>{u.order_count}</Td>
            <Td>{u.id !== a.id && <div className="flex gap-1">
              {u.status !== "active" && <ActionButton action={setUserStatus} values={{ user_id: u.id, status: "active" }}>Reinstate</ActionButton>}
              {u.status === "active" && <ActionButton action={setUserStatus} values={{ user_id: u.id, status: "restricted" }}>Restrict</ActionButton>}
              {u.status !== "suspended" && <ActionButton action={setUserStatus} values={{ user_id: u.id, status: "suspended" }} variant="danger" confirm={`Suspend ${u.full_name}? They'll be logged out and their storefront hidden.`}>Suspend</ActionButton>}
            </div>}</Td>
          </tr>
        ))}
      </Table>
      <Pager page={page} hasNext={rows.length > 30} query={{ q }} />
    </>
  );
}
