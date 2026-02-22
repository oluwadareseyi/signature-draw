"use client";
import { motion } from "motion/react";
import { ReactNode } from "react";
import useMeasure from "react-use-measure";

const SPRING = { type: "spring" as const, stiffness: 380, damping: 34 };

export default function AnimatedCard({ children }: { children: ReactNode }) {
  const [ref, bounds] = useMeasure();

  return (
    <motion.div
      animate={{ height: bounds.height > 0 ? bounds.height : "auto" }}
      transition={{ ...SPRING }}
      className="w-full rounded-2xl border overflow-hidden"
      style={{ background: "#111111", borderColor: "var(--border)" }}
    >
      <div ref={ref} className="p-5 space-y-3">
        {children}
      </div>
    </motion.div>
  );
}
