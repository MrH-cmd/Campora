import { Empty, PageHead, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Activity log" };
export default async function Logs() {
  const a = await requireAdmin();
  const rows = await asUser(a.id, (db) => db.rows("select l.*, u.full_name from admin_activity_logs l join users u on u.id=l.admin_id order by l.created_at desc limit 200"));
  return <><PageHead title="Activity log" />{rows.length === 0 ? <Empty title="No admin activity yet" /> : <Table head={["When", "Admin", "Action", "Target"]}>{rows.map((l) => <tr key={l.id}><Td>{dateTime(l.created_at)}</Td><Td>{l.full_name}</Td><Td>{l.action}</Td><Td className="text-xs text-mute">{l.target_id}</Td></tr>)}</Table>}</>;
}
