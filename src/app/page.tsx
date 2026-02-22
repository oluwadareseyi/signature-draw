"use client";
import { useState } from "react";
import SignatureWidget from "@/components/SignatureWidget";
import AnimatedCard from "@/components/AnimatedCard";

export default function Home() {
  const [status, setStatus] = useState<"pending" | "processing" | "completed">("pending");
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-md">
        {/* Header text */}
        <div className="text-center space-y-2.5">
          <h1 className="text-[2.6rem] leading-tight tracking-tight">
            Add your signature
          </h1>
          <p className="text-sm leading-relaxed text-pretty opacity-80">
            Sign the document below. We&apos;ll replay your signature to verify
            it.
          </p>
        </div>

        {/* Faked document card */}
        <AnimatedCard>
          <div className="flex items-center justify-between">
            <p
              className="text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              NDA — Mutual Non-Disclosure Agreement
            </p>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                background:
                  status === "completed" ? "rgba(34,197,94,0.15)"
                  : status === "processing" ? "rgba(234,179,8,0.15)"
                  : "rgba(255,255,255,0.06)",
                color:
                  status === "completed" ? "rgb(134,239,172)"
                  : status === "processing" ? "rgb(253,224,71)"
                  : "var(--text-muted)",
                transition: "background 0.4s, color 0.4s",
              }}
            >
              <span className={status === "processing" ? "animate-pulse" : ""}>
                {status === "completed" ? "Completed" : status === "processing" ? "Processing" : "Pending"}
              </span>
            </span>
          </div>

          {/* Fake text lines */}
          <div className="space-y-1.5 py-1">
            {[82, 96, 75, 88, 65, 91, 70].map((w, i) => (
              <div
                key={i}
                className="h-1.5 rounded-full"
                style={{
                  width: `${w}%`,
                  background: "rgba(255,255,255,0.05)",
                }}
              />
            ))}
          </div>

          {/* Signature section */}
          <div
            className="pt-3 border-t"
            style={{ borderColor: "var(--border)" }}
          >
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Signatory signature
            </p>
            <SignatureWidget
              onProcessing={() => setStatus("processing")}
              onConfirmed={() => setStatus("completed")}
              onClose={() => setStatus("pending")}
            />
          </div>
        </AnimatedCard>
      </div>
    </main>
  );
}
