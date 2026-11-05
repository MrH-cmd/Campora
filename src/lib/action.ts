import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { ActionError } from "./auth";

export type ActionState = { ok?: boolean; error?: string; message?: string; fields?: Record<string, string> };

const FRIENDLY = /^(LISTING_LIMIT|PHOTO_LIMIT|REVIEW_REQUIRED|LISTING_REMOVED|ORDER_TRANSITION): (.+)$/;

export function friendlyError(e: unknown): string {
  if (e instanceof ActionError) return e.message;
  const m = (e as Error)?.message ?? "";
  const hit = m.match(FRIENDLY);
  if (hit) return hit[2][0].toUpperCase() + hit[2].slice(1) + ".";
  console.error(e);
  return "Something went wrong on our side. Try again.";
}

/** Wraps a server action: validates the form on the server and turns failures into form messages. */
export function action<S extends z.ZodType>(
  schema: S,
  fn: (input: z.output<S>, form: FormData) => Promise<string | void>,
) {
  return async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    const raw: Record<string, unknown> = {};
    for (const k of new Set(form.keys())) if (!k.startsWith("$ACTION")) raw[k] = form.get(k);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const i of parsed.error.issues) fields[String(i.path[0])] ??= i.message;
      return { error: "Check the highlighted fields.", fields };
    }
    try {
      const message = await fn(parsed.data, form);
      return { ok: true, message: message ?? "Saved." };
    } catch (e) {
      unstable_rethrow(e);
      return { error: friendlyError(e) };
    }
  };
}

export const id = z.string().uuid();
export const nairaAmount = z.coerce.number({ error: "Enter an amount" }).min(0, "Must be 0 or more").max(100_000_000);
export const text = (min: number, max: number, label = "This field") =>
  z.string().trim().min(min, min === 1 ? `${label} is required` : `${label} needs at least ${min} characters`).max(max);
export const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
