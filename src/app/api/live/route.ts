import { asSystem } from "@/lib/db";
import { liveCounts } from "@/lib/live";

/** Public totals only. Vercel's edge cache keeps this cheap however many people are watching. */
export async function GET() {
  const { online, registered } = await asSystem(liveCounts);
  return Response.json({ online, registered }, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } });
}
