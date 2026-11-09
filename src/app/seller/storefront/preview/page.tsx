import Link from "next/link";
import { StorefrontView } from "@/components/storefront/view";
import { designFromTemplate } from "@/lib/storefront-catalog";
import { canUseTemplate, planName, violations } from "@/lib/storefront-access";
import { mediaMap } from "@/lib/storefront";
import { loadBuilder } from "../data";

export const metadata = { title: "Preview" };
export default async function Preview({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const q = await searchParams;
  const b = await loadBuilder({ content: true });
  const t = q.template ? b.catalog.templates.find((x) => x.slug === q.template && x.is_active !== false) : null;
  const design = t ? designFromTemplate(t, b.draft) : b.draft;
  const template = b.catalog.templates.find((x) => x.slug === design.template) ?? b.catalog.templates[0];
  const issues = violations(design, b.access, b.catalog, mediaMap(b.active)).filter((v) => v.need);
  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8">
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-4 py-2 text-sm">
        <span><b>Preview.</b> {t ? `${t.name} with your real products.` : "Your draft."} Buyers don't see this.
          {t && !canUseTemplate(b.catalog, b.access, t) && <> Needs the {planName(b.catalog, t.min_plan_code)} plan.</>}
          {!t && issues.length > 0 && <> {issues[0].message}</>}</span>
        <span className="flex gap-3"><Link className="font-semibold underline" href="/seller/storefront/designs">Designs</Link><Link className="font-semibold underline" href="/seller/storefront/editor">Editor</Link></span>
      </div>
      <StorefrontView content={b.content!} design={design} template={template} media={b.active} assets={b.assets} preview isOwner={false} stickyTop={41} />
    </div>
  );
}
