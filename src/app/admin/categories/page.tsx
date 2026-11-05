import { saveCategory } from "@/app/actions/admin";
import { Field, Form, Submit } from "@/components/form";
import { Card, PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";

export const metadata = { title: "Categories" };
export default async function C() {
  const a = await requireAdmin();
  const rows = await asUser(a.id, (db) => db.rows("select * from categories order by kind, sort, name"));
  return (
    <>
      <PageHead title="Categories" />
      <Card className="mb-4 max-w-md">
        <Form action={saveCategory} resetOnSuccess className="flex items-end gap-2">
          <Field label="New category" name="name" /><Field label="Type" name="kind" as="select"><option value="product">Product</option><option value="service">Service</option></Field><Submit>Add</Submit>
        </Form>
      </Card>
      <div className="grid gap-2 md:grid-cols-2">{rows.map((c) => (
        <Card key={c.id}>
          <Form action={saveCategory} className="flex items-end gap-2">
            <input type="hidden" name="id" value={c.id} /><input type="hidden" name="kind" value={c.kind} />
            <div className="flex-1"><Field label={c.kind === "product" ? "Product category" : "Service category"} name="name" defaultValue={c.name} /></div>
            <div className="w-24"><Field label="Rate %" name="commission_percent" placeholder="Default" defaultValue={c.commission_bps != null ? c.commission_bps / 100 : ""} /></div>
            <label className="flex h-11 items-center gap-1 text-sm"><input type="checkbox" name="is_active" defaultChecked={c.is_active} className="accent-palm" />Live</label>
            <Submit size="sm" variant="outline">Save</Submit>
          </Form>
        </Card>
      ))}</div>
    </>
  );
}
