"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { finishMediaUpload, startMediaUpload } from "@/app/actions/storefront";
import { toast } from "@/components/toast";

const MB = 1024 * 1024;
/** Reads a video's length in the browser so sellers hear about the 20 second limit before uploading. */
const videoLength = (f: File) => new Promise<number | null>((res) => {
  const v = document.createElement("video"); v.preload = "metadata";
  v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); res(v.duration); }; v.onerror = () => res(null);
  v.src = URL.createObjectURL(f);
});

/** GIF and video banners go straight from the browser to storage, then the server checks the stored bytes. */
export function AnimatedUpload({ enabled, reason }: { enabled: boolean; reason: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [rights, setRights] = useState(false); const [progress, setProgress] = useState("");
  const upload = async (f: File) => {
    const ext = f.name.toLowerCase().split(".").pop() ?? "";
    const kind = ext === "gif" ? "gif" : "video";
    if (!["gif", "mp4", "webm"].includes(ext)) return toast("Upload a .gif, .mp4 or .webm file.", "error");
    if (f.size > (kind === "gif" ? 8 : 15) * MB) return toast(kind === "gif" ? "GIFs must be 8 MB or smaller." : "Videos must be 15 MB or smaller. Export at 720p or trim it.", "error");
    if (kind === "video") { const s = await videoLength(f); if (s != null && s > 20.5) return toast(`Banner videos can be at most 20 seconds. This one is ${Math.round(s)} seconds.`, "error"); }
    setBusy(true); setProgress("Starting...");
    try {
      const s = await startMediaUpload({ kind, ext, bytes: f.size, rights });
      if ("error" in s && s.error) return toast(s.error, "error");
      const { id, uploadUrl } = s as { id: string; uploadUrl: string };
      setProgress("Uploading...");
      const put = await fetch(uploadUrl, { method: "PUT", body: f, headers: { "Content-Type": f.type || "application/octet-stream", "x-upsert": "false" } });
      if (!put.ok) { await finishMediaUpload(id); return toast("The upload failed. Check your connection and try again.", "error"); }
      setProgress("Checking the file...");
      const r = await finishMediaUpload(id);
      if (r.error) toast(r.error, "error"); else { toast(r.message!); router.refresh(); }
    } finally { setBusy(false); setProgress(""); }
  };
  if (!enabled) return <p className="text-sm text-mute">{reason}</p>;
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={rights} onChange={(e) => setRights(e.target.checked)} />I own the rights to this artwork. It contains no copyrighted characters or logos I don't own.</label>
      <input type="file" accept=".gif,.mp4,.webm,image/gif,video/mp4,video/webm" disabled={busy || !rights} aria-label="GIF or video file"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-palm file:px-3 file:py-1.5 file:font-semibold file:text-white disabled:opacity-50" />
      <p className="text-xs text-mute" aria-live="polite">{progress || "GIF up to 8 MB. MP4 or WebM up to 15 MB and 20 seconds. Videos always play muted."}</p>
    </div>
  );
}
