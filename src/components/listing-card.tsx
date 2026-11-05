import { Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { FavButton } from "./shop-client";
import { Img, Price } from "./ui";

export type CardListing = {
  id: string; slug: string; title: string; kind: string; cover: string | null; price_kobo: number; effective_price_kobo: number;
  store_name: string; store_slug: string; rating: number; review_count: number; in_stock: boolean; price_type: string | null;
  featured?: boolean; search_boosted?: boolean; is_sample?: boolean; university_short?: string;
};

export function ListingCard({ l, faved, sponsored }: { l: CardListing; faved?: boolean; sponsored?: boolean }) {
  return (
    <article className="group relative">
      <Link href={`/listing/${l.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-tag bg-mint-soft">
          <Img path={l.cover} alt={l.title} className="size-full transition duration-500 ease-out group-hover:scale-[1.05]" />
          {!l.in_stock && <span className="absolute inset-x-0 bottom-0 bg-ink/75 py-1.5 text-center text-xs font-semibold text-white">{l.kind === "product" ? "Sold out" : "Fully booked"}</span>}
          {sponsored && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-sun px-2 py-0.5 text-[11px] font-semibold text-ink"><Sparkles size={11} aria-hidden />Sponsored</span>}
        </div>
        <div className="tag-notch relative z-10 -mt-7 ml-2 inline-block bg-white px-4 py-1.5 text-[15px] shadow-sm transition-transform duration-300 group-hover:-translate-y-1">
          <Price kobo={l.effective_price_kobo} was={l.price_kobo} from={l.price_type === "starting_from"} />
        </div>
        <h3 className="mt-1.5 line-clamp-2 font-sans text-[15px] font-medium leading-snug tracking-normal">{l.title}</h3>
      </Link>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[13px] text-mute">
        <Link href={`/store/${l.store_slug}`} className="truncate hover:text-ink">{l.store_name}</Link>
        {l.review_count > 0 && <span className="flex shrink-0 items-center gap-0.5"><Star size={12} className="fill-sun text-sun" aria-hidden />{Number(l.rating).toFixed(1)}<span className="sr-only"> stars</span></span>}
      </div>
      <div className="absolute right-2 top-2"><FavButton listingId={l.id} initial={!!faved} /></div>
    </article>
  );
}

export const CardGrid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{children}</div>
);

export const CardSkeletons = ({ n = 10 }: { n?: number }) => (
  <CardGrid>{Array.from({ length: n }, (_, i) => (
    <div key={i}><div className="skeleton aspect-[4/5] rounded-tag" /><div className="skeleton mt-3 h-4 w-4/5 rounded" /><div className="skeleton mt-2 h-3 w-1/2 rounded" /></div>
  ))}</CardGrid>
);
