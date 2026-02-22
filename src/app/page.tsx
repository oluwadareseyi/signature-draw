"use client";
import { useState } from "react";
import SignatureWidget from "@/components/SignatureWidget";
import AnimatedCard from "@/components/AnimatedCard";

export default function Home() {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-md">
        {/* Header text */}
        <div className="text-center space-y-2.5">
          <p
            className="text-xs tracking-[0.18em] uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Document signing
          </p>
          <h1
            className="text-[2.6rem] leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Add your signature
          </h1>
          <p
            className="text-sm leading-relaxed text-pretty"
            style={{ color: "var(--text-muted)" }}
          >
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
                background: confirmed ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
                color: confirmed ? "rgb(134,239,172)" : "var(--text-muted)",
                transition: "background 0.4s, color 0.4s",
              }}
            >
              {confirmed ? "Completed" : "Pending"}
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
            <SignatureWidget onConfirmed={() => setConfirmed(true)} />
          </div>
        </AnimatedCard>
      </div>
    </main>
  );
}
