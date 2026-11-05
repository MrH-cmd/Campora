"use client";
import { MotionConfig, animate, motion, useReducedMotion, useScroll } from "motion/react";
import { usePathname } from "next/navigation";
import { Children, useEffect, useRef, type ReactNode } from "react";

export const MotionRoot = ({ children }: { children: ReactNode }) => <MotionConfig reducedMotion="user">{children}</MotionConfig>;

export function PageTransition({ children }: { children: ReactNode }) {
  const path = usePathname();
  return <motion.div key={path} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .28, ease: [.2, .7, .2, 1] }}>{children}</motion.div>;
}

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }} transition={{ duration: .5, delay, ease: [.2, .7, .2, 1] }}>
      {children}
    </motion.div>
  );
}

export function Float({ children, className, y = 10, duration = 6, delay = 0, rotate = 0 }: { children: ReactNode; className?: string; y?: number; duration?: number; delay?: number; rotate?: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.div className={className} style={{ rotate }}
      initial={{ opacity: 0, y: 30, scale: .92 }}
      animate={reduced ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, y: [0, -y, 0], scale: 1 }}
      transition={{ opacity: { delay, duration: .5 }, scale: { delay, duration: .5 }, y: { delay, duration, repeat: Infinity, ease: "easeInOut" } }}>
      {children}
    </motion.div>
  );
}

/** Children rise in one after another as the group scrolls into view. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial="hide" whileInView="show" viewport={{ once: true, margin: "-40px" }}
      variants={{ show: { transition: { staggerChildren: .06 } } }}>
      {Children.map(children, (c) => (
        <motion.div variants={{ hide: { opacity: 0, y: 22, scale: .97 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: .45, ease: [.2, .7, .2, 1] } } }}>{c}</motion.div>
      ))}
    </motion.div>
  );
}

export function WordsIn({ text, className }: { text: string; className?: string }) {
  return (
    <h1 className={className} aria-label={text}>
      {text.split(" ").map((w, i) => (
        <motion.span key={i} aria-hidden className="gradient-text mr-[.25em] inline-block" initial={{ opacity: 0, y: "60%", rotate: 3 }} animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: .6, delay: .05 + i * .07, ease: [.2, .7, .2, 1] }}>{w}</motion.span>
      ))}
    </h1>
  );
}

export function CountUp({ value, format }: { value: number; format?: "naira" }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const show = (n: number) => (format === "naira" ? "₦" + Math.round(n).toLocaleString("en-NG") : Math.round(n).toLocaleString("en-NG"));
  useEffect(() => {
    if (reduced) return;
    const c = animate(0, value, { duration: .9, ease: "easeOut", onUpdate: (n) => { if (ref.current) ref.current.textContent = show(n); } });
    return () => c.stop();
  }, [value, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref}>{show(value)}</span>;
}

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  return <motion.div aria-hidden style={{ scaleX: scrollYProgress }} className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-gradient-to-r from-[#7c3aed] to-[#e879f9]" />;
}
