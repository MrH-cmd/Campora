import { setUserRole, setUserStatus } from "@/app/actions/admin";
import { ActionButton, Form, Submit } from "@/components/form";
import { Badge, buttonClass, PageHead, Pager, statusTone, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { shortDate } from "@/lib/format";

export const metadata = { title: "Users" };
export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; role?: string }> }) {
  const p = await searchParams;
  const a = await requireAdmin();
  const page = Math.max(1, Number(p.page) || 1);
  const q = p.q?.trim() ?? "";
  const role = ["admin", "seller", "customer"].includes(p.role ?? "") ? p.role! : null;
  const rows = await asUser(a.id, (db) => db.rows(
    `select u.id,u.full_name,u.email,u.role,u.status,u.student_status,u.created_at,u.is_sample, (select count(*)::int from orders o where o.buyer_id=u.id) order_count from users u
     where ($3::text is null or u.role::text=$3) and ($1='' or u.full_name ilike '%'||$1||'%' or u.email ilike '%'||$1||'%') order by u.created_at desc limit 31 offset $2`, [q, (page - 1) * 30, role]));
  return (
    <>
      <PageHead title="Users" />
      <form className="mb-4 flex max-w-md gap-2"><input name="q" defaultValue={q} placeholder="Search name or email" aria-label="Search users" className="input" /><select name="role" defaultValue={role ?? ""} aria-label="Role" className="input w-36"><option value="">All roles</option><option value="admin">Admins</option><option value="seller">Sellers</option><option value="customer">Customers</option></select><button className={buttonClass("dark")}>Search</button></form>
      <Table head={["User", "Role", "Student", "Status", "Joined", "Orders", "Actions"]}>
        {rows.slice(0, 30).map((u) => (
          <tr key={u.id}>
            <Td><p className="font-medium">{u.full_name}{u.is_sample && <span className="ml-1 text-xs text-mute">(sample)</span>}</p><p className="text-xs text-mute">{u.email}</p></Td>
            <Td className="capitalize">{u.role}</Td><Td><Badge tone={statusTone(u.student_status)}>{u.student_status}</Badge></Td><Td><Badge tone={statusTone(u.status)}>{u.status}</Badge></Td><Td>{shortDate(u.created_at)}</Td><Td>{u.order_count}</Td>
            <Td>{u.id !== a.id && <div className="flex flex-wrap items-start gap-1">
              {u.role === "admin"
                ? <ActionButton action={setUserRole} values={{ user_id: u.id, make: "remove" }} confirm={`Remove admin access from ${u.full_name}? They lose the admin dashboard and the free top plan.`}>Remove admin</ActionButton>
                : u.status === "active" && (
                  <details className="relative">
                    <summary className={`${buttonClass("outline", "sm")} cursor-pointer list-none`}>Make admin</summary>
                    <Form action={setUserRole} toastOnly className="absolute right-0 z-20 mt-1 w-64 space-y-2 rounded-tag border border-line bg-card p-3 shadow-xl">
                      <input type="hidden" name="user_id" value={u.id} /><input type="hidden" name="make" value="admin" />
                      <p className="text-xs text-mute">{u.full_name} will get the full admin dashboard (users, money, payouts) and every seller plan feature for free.</p>
                      <label className="block text-xs font-medium">Your password to confirm<input type="password" name="password" required autoComplete="current-password" className="input mt-1 py-1.5" /></label>
                      <Submit size="sm" className="w-full">Make admin</Submit>
                    </Form>
                  </details>
                )}
              {u.status !== "active" && <ActionButton action={setUserStatus} values={{ user_id: u.id, status: "active" }}>Reinstate</ActionButton>}
              {u.status === "active" && <ActionButton action={setUserStatus} values={{ user_id: u.id, status: "restricted" }}>Restrict</ActionButton>}
              {u.status !== "suspended" && <ActionButton action={setUserStatus} values={{ user_id: u.id, status: "suspended" }} variant="danger" confirm={`Suspend ${u.full_name}? They'll be logged out and their storefront hidden.`}>Suspend</ActionButton>}
            </div>}</Td>
          </tr>
        ))}
      </Table>
      <Pager page={page} hasNext={rows.length > 30} query={{ q, role: role ?? undefined }} />
    </>
  );
}
