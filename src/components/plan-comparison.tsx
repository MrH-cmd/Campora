import { Check, Minus } from "lucide-react";
import { Fragment } from "react";
import { asUser } from "@/lib/db";
import { featureMatrix } from "@/lib/plans";

/** Side-by-side comparison of every plan, built from the live plan settings so it always matches what's enforced. */
export async function PlanComparison({ current }: { current?: string }) {
  const m = await asUser(null, featureMatrix);
  const cell = (v: string | number | boolean) => v === true ? <Check size={17} className="mx-auto text-palm-deep" aria-label="Included" />
    : v === false ? <Minus size={17} className="mx-auto text-mute" aria-label="Not included" /> : <span className="font-semibold">{v}</span>;
  return (
    <div className="overflow-x-auto rounded-tag border border-line" data-plan-comparison>
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="bg-white/5">
            <th scope="col" className="p-3 text-left font-semibold">Feature</th>
            {m.plans.map((p) => <th key={p.code} scope="col" className={`p-3 text-center font-bold ${p.code === current ? "text-palm-deep" : ""}`}>{p.name}{p.code === current && <span className="block text-xs font-medium">Your plan</span>}</th>)}
          </tr>
        </thead>
        <tbody>
          {m.groups.map((g) => (
            <Fragment key={g.name}>
              <tr><th colSpan={m.plans.length + 1} scope="colgroup" className="bg-white/[.03] px-3 pt-4 pb-1.5 text-left text-xs font-semibold uppercase tracking-wider text-mute">{g.name}</th></tr>
              {g.rows.map((r) => (
                <tr key={r.label} className="border-t border-line">
                  <th scope="row" className="p-3 text-left font-normal">{r.label}{r.hint && <span className="block text-xs text-mute">{r.hint}</span>}</th>
                  {r.values.map((v, i) => <td key={i} className="p-3 text-center">{cell(v)}</td>)}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
