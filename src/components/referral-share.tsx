"use client";
import { buttonClass } from "./ui";
import { toast } from "./toast";

export function ReferralShare({ code, link }: { code: string; link: string }) {
  const copy = async (t: string, m: string) => { await navigator.clipboard.writeText(t); toast(m); };
  const text = `Join me on Vybe Market, the student marketplace: ${link}`;
  return (
    <div className="mt-2">
      <p className="break-all rounded-xl bg-panel-2 px-3 py-2 text-sm">{link}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={buttonClass("primary", "sm")} onClick={() => copy(link, "Link copied.")}>Copy link</button>
        <button type="button" className={buttonClass("outline", "sm")} onClick={() => copy(code, "Code copied.")}>Copy code {code}</button>
        <a className={buttonClass("outline", "sm")} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        <button type="button" className={buttonClass("outline", "sm")} onClick={() => (navigator.share ? navigator.share({ text }).catch(() => {}) : copy(text, "Message copied."))}>Share</button>
      </div>
    </div>
  );
}
