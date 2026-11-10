import { Editor } from "@/components/storefront/editor";
import { canUseEffect, planName, rankOf } from "@/lib/storefront-access";
import { loadBuilder } from "../data";
import { StoreTabs } from "../tabs";

export const metadata = { title: "Storefront editor" };
export default async function EditorPage() {
  const b = await loadBuilder({ content: true });
  const c = b.catalog;
  const assets = c.assets.filter((a) => a.is_active !== false)
    .sort((x, y) => rankOf(c, x.min_plan_code) - rankOf(c, y.min_plan_code) || x.sort - y.sort)
    .map((a) => ({ slug: a.slug, name: a.name, description: a.description, category: a.category, renderer: a.renderer, params_schema: a.params_schema, locked: !canUseEffect(c, b.access, a), needName: planName(c, a.min_plan_code) }));
  const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  return (
    <>
      <StoreTabs on="/editor" />
      <Editor initial={b.draft} published={b.published} assets={assets} fx={b.assets} media={b.active} content={plain(b.content!)}
        access={b.access} catalog={plain(c)} />
    </>
  );
}
