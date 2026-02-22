"use client";
import { RefObject, useEffect } from "react";
import { motion } from "motion/react";
import type { Stroke } from "./hooks";

interface CanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  svgRef: RefObject<SVGSVGElement | null>;
  svgPathRef: RefObject<SVGPathElement | null>;
  svgViewBox: string;
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  calibrateCanvas: () => void;
  isReplaying: boolean;
  signDuration: number;
  strokes: Stroke[];
  mode: "draw" | "type";
  typedName: string;
  onTypedNameChange: (name: string) => void;
  onTypeSubmit: () => void;
}

export default function Canvas({
  canvasRef,
  svgRef,
  svgPathRef,
  svgViewBox,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  calibrateCanvas,
  isReplaying,
  signDuration,
  strokes,
  mode,
  typedName,
  onTypedNameChange,
  onTypeSubmit,
}: CanvasProps) {
  useEffect(() => {
    calibrateCanvas();
  }, [calibrateCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
    };
  }, [canvasRef, onPointerDown, onPointerMove, onPointerUp]);

  return (
    <div className="relative" style={{ height: 140 }}>
      {/* "Sign here" placeholder — draw mode only */}
      {mode === "draw" && strokes.length === 0 && !isReplaying && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center select-none"
          style={{
            color: "rgba(255,255,255,0.1)",
            fontFamily: "var(--font-serif)",
            fontSize: 28,
          }}
        >
          Sign here
        </div>
      )}

      {/* Drawing canvas — always in DOM so ref stays valid; invisible in type mode */}
      <motion.canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{
          touchAction: "none",
          cursor: mode === "type" ? "default" : "crosshair",
          pointerEvents: mode === "type" ? "none" : "auto",
        }}
        animate={{
          opacity:
            mode === "type" ? 0 : isReplaying ? 0.08 : 1,
        }}
        transition={{ duration: 0.35 }}
      />

      {/* Type input — type mode only */}
      {mode === "type" && (
        <motion.input
          type="text"
          value={typedName}
          onChange={(e) => onTypedNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onTypeSubmit();
          }}
          readOnly={isReplaying}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          placeholder="Type your name..."
          className="absolute inset-0 w-full text-center bg-transparent border-none"
          style={{
            outline: "none",
            fontFamily: "var(--font-signature)",
            fontSize: "clamp(24px, 7vw, 40px)",
            color: "white",
            caretColor: isReplaying
              ? "transparent"
              : "rgba(255,255,255,0.5)",
          }}
          animate={{ opacity: isReplaying ? 0.08 : 1 }}
          transition={{ duration: 0.35 }}
        />
      )}

      {/* SVG replay overlay */}
      <motion.div
        className="pointer-events-none absolute inset-0 w-full h-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: isReplaying ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <svg
          ref={svgRef}
          className="w-full h-full"
          viewBox={svgViewBox}
          fill="none"
        >
          <path
            ref={svgPathRef}
            d=""
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </motion.div>

      {/* Progress bar during replay */}
      {isReplaying && (
        <motion.div
          className="absolute bottom-0 left-0 h-px"
          style={{ background: "rgba(255,255,255,0.25)" }}
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: signDuration, ease: "linear" }}
        />
      )}
    </div>
  );
}
