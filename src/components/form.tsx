"use client";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useRef, useState, useTransition, type ComponentProps, type ReactNode } from "react";
import type { ActionState } from "@/lib/action";
import { buttonClass } from "./ui";
import { toast } from "./toast";

type Act = (s: ActionState, f: FormData) => Promise<ActionState>;

const Pending = createContext(false);

export function Form({ action, children, className, resetOnSuccess, toastOnly, onDone }: {
  action: Act; children: ReactNode; className?: string; resetOnSuccess?: boolean; toastOnly?: boolean; onDone?: () => void;
}) {
  const [state, setState] = useState<ActionState>({});
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  return (
    <form ref={ref} className={className} noValidate
      onSubmit={(e) => {
        // Runs the action by hand so a failed attempt keeps what was typed,
        // and the toast still shows when success removes this form from the page.
        e.preventDefault();
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        start(async () => {
          const r = await action({}, data);
          setState(r);
          if (r.ok) {
            toast(r.message ?? "Saved.");
            if (resetOnSuccess) ref.current?.reset();
            onDone?.();
            router.refresh();
          } else if (r.error && toastOnly) toast(r.error, "error");
        });
      }}>
      <Pending.Provider value={pending}>{children}</Pending.Provider>
      {state.error && !toastOnly && <p role="alert" className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{state.error}</p>}
      {state.fields && <FieldErrors fields={state.fields} />}
    </form>
  );
}

function FieldErrors({ fields }: { fields: Record<string, string> }) {
  return <ul className="mt-2 text-sm text-coral">{Object.entries(fields).map(([k, v]) => <li key={k}>{v}</li>)}</ul>;
}

export function Submit({ children, variant = "primary", size = "md", className = "", confirm: message }: {
  children: ReactNode; variant?: Parameters<typeof buttonClass>[0]; size?: Parameters<typeof buttonClass>[1]; className?: string; confirm?: string;
}) {
  const pending = useContext(Pending);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref} type={message ? "button" : "submit"} disabled={pending} onClick={message ? () => setOpen(true) : undefined}
        className={`${buttonClass(variant, size)} ${className}`} aria-busy={pending}>
        {pending ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
        {children}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div role="alertdialog" aria-modal aria-label="Confirm" className="w-full rounded-t-2xl bg-white p-5 sm:max-w-sm sm:rounded-2xl"
              initial={{ y: 24, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24 }}>
              <p className="font-semibold">{message}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className={buttonClass("ghost")} onClick={() => setOpen(false)}>Keep it</button>
                <button type="button" autoFocus className={buttonClass(variant === "danger" ? "dark" : variant)} onClick={() => { setOpen(false); ref.current?.form?.requestSubmit(); }}>Yes, continue</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function Field({ label, name, hint, as = "input", children, ...p }: {
  label: string; name: string; hint?: string; as?: "input" | "textarea" | "select"; children?: ReactNode;
} & ComponentProps<"input"> & ComponentProps<"textarea"> & ComponentProps<"select">) {
  const Tag = as as any;
  return (
    <label className="block text-sm font-medium">
      {label}
      <Tag name={name} className="input mt-1 font-normal" {...p}>{children}</Tag>
      {hint && <span className="mt-1 block text-xs font-normal text-mute">{hint}</span>}
    </label>
  );
}

/** A single button that runs an action; hidden values travel with it. */
export function ActionButton({ action, values, children, variant = "outline", size = "sm", confirm, className }: {
  action: Act; values?: Record<string, string>; children: ReactNode;
  variant?: Parameters<typeof buttonClass>[0]; size?: Parameters<typeof buttonClass>[1]; confirm?: string; className?: string;
}) {
  return (
    <Form action={action} toastOnly className={className ?? "inline-block"}>
      {Object.entries(values ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Submit variant={variant} size={size} confirm={confirm}>{children}</Submit>
    </Form>
  );
}

export function ImagePicker({ name = "images", max, existing = 0, multiple = true }: { name?: string; max: number; existing?: number; multiple?: boolean }) {
  const [previews, setPreviews] = useState<string[]>([]);
  const left = max - existing;
  return (
    <div>
      <input type="file" name={name} multiple={multiple} accept="image/jpeg,image/png,image/webp" className="input" aria-label="Choose images"
        onChange={(e) => setPreviews(Array.from(e.target.files ?? []).map((f) => URL.createObjectURL(f)))} />
      <p className="mt-1 text-xs text-mute">{multiple ? `You can add ${Math.max(left, 0)} more on your plan. ` : ""}JPG, PNG or WebP up to 5 MB.</p>
      {previews.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {previews.map((p) => <img key={p} src={p} alt="Upload preview" className="size-20 rounded-lg object-cover" />)}
        </div>
      )}
    </div>
  );
}
