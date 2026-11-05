"use client";
import { Share2 } from "lucide-react";
import { buttonClass } from "./ui";
import { toast } from "./toast";

export function ShareButton({ url: path }: { url?: string }) {
  return (
    <button type="button" className={buttonClass("outline", "sm")} onClick={async () => {
      const url = path ? location.origin + path : location.href;
      if (navigator.share) await navigator.share({ url }).catch(() => {});
      else { await navigator.clipboard.writeText(url); toast("Link copied."); }
    }}><Share2 size={15} aria-hidden />Share</button>
  );
}
