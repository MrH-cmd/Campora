"use client";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
