export const naira = (kobo: number | string | null | undefined) =>
  kobo == null ? "Not set" : "₦" + (Number(kobo) / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 });

export const toKobo = (naira: string | number) => Math.round(Number(naira) * 100);

export const fileUrl = (path?: string | null) => (path ? `/files/${path}` : null);

export const shortDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

export const dateTime = (d: string | Date) =>
  new Date(d).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export const timeAgo = (d: string | Date) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return shortDate(d);
};

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Pending", accepted: "Accepted", processing: "Processing",
  ready_for_pickup: "Ready for pickup", completed: "Completed", cancelled: "Cancelled",
};

export const PAYMENT_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting payment", paid: "Paid online", pay_on_pickup: "Pay at pickup",
  collected: "Paid at pickup", refunded: "Refunded", failed: "Payment failed",
};

export const LISTING_STATUS_LABEL: Record<string, string> = {
  draft: "Draft", pending_review: "In review", active: "Active", inactive: "Inactive",
  rejected: "Rejected", removed: "Removed",
};

export const PLACEMENT_LABEL: Record<string, string> = {
  homepage_featured: "Homepage featured", search_priority: "Top of search", storefront_promoted: "Promoted storefront",
};
