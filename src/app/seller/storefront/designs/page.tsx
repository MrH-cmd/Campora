import { Gallery } from "@/components/storefront/gallery";
import { PageHead } from "@/components/ui";
import { canUseTemplate, planName, rankOf } from "@/lib/storefront-access";
import { mediaUrl } from "@/lib/storefront-media";
import { loadBuilder } from "../data";
import { StoreTabs } from "../tabs";

export const metadata = { title: "Store designs" };
export default async function Designs() {
  const b = await loadBuilder();
  const templates = b.catalog.templates.filter((t) => t.is_active !== false)
    .sort((x, y) => rankOf(b.catalog, x.min_plan_code) - rankOf(b.catalog, y.min_plan_code) || x.sort - y.sort)
    .map((t) => ({ ...t, locked: !canUseTemplate(b.catalog, b.access, t), needName: planName(b.catalog, t.min_plan_code), preview: mediaUrl(t.preview_path), mobilePreview: mediaUrl(t.mobile_preview_path) }));
  const open = templates.filter((t) => !t.locked).length;
  return (
    <div>
      <PageHead title="My Storefront" sub={`Your ${b.access.name} plan includes ${open} of ${templates.length} designs. Selecting one changes your draft only.`} />
      <StoreTabs on="/designs" />
      <Gallery templates={JSON.parse(JSON.stringify(templates))} assets={b.assets} current={b.draft.template} />
    </div>
  );
}
