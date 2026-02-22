"use client";
import { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import Canvas from "./Canvas";
import {
  useSignatureCapture,
  useSignatureReplay,
  isValidSignature,
  preloadSignatureFont,
  generateStrokesFromText,
  getStrokeDuration,
} from "./hooks";
import type { Stroke } from "./hooks";
import { useSignatureState } from "./useSignatureState";

// ─── Icons ────────────────────────────────────────────────────────────────────

function PenIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.38 3.62a1 1 0 0 1 3 3L7.37 18.64a2 2 0 0 1-.86.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.86z" />
    </svg>
  );
}

function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function EraseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
      <path d="M22 21H7" />
      <path d="m5 11 9 9" />
    </svg>
  );
}

function TypeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function SquiggleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 3.5c5-2 7 2.5 3 4C1.5 10 2 15 5 16c5 2 9-10 14-7s.5 13.5-4 12c-5-2.5.5-11 6-2" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const SPRING = { type: "spring" as const, stiffness: 380, damping: 34 };

export default function SignatureWidget({ onConfirmed, onProcessing, onClose }: { onConfirmed?: () => void; onProcessing?: () => void; onClose?: () => void } = {}) {
  const [state, setState] = useSignatureState();
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState("");
  const [generatedStrokes, setGeneratedStrokes] = useState<Stroke[] | null>(null);
  const [svgViewBox, setSvgViewBox] = useState("0 0 380 140");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const svgPathRef = useRef<SVGPathElement>(null);

  const {
    strokes,
    calibrateCanvas,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    clearSignature,
    getSignatureDuration,
  } = useSignatureCapture(canvasRef);

  const { replay, cancelReplay } = useSignatureReplay();

  const isReplaying = state === "confirming";
  const isValid = isValidSignature(strokes);

  const signDuration = generatedStrokes
    ? getStrokeDuration(generatedStrokes)
    : getSignatureDuration();

  const resetSvg = () => {
    if (svgPathRef.current) svgPathRef.current.setAttribute("d", "");
  };

  const handleOpen = () => {
    setState("open");
    // Preload the font in the background so it's ready when the user confirms
    preloadSignatureFont();
  };

  const handleClose = useCallback(() => {
    cancelReplay();
    clearSignature();
    resetSvg();
    setState("closed");
    setMode("draw");
    setTypedName("");
    setGeneratedStrokes(null);
    onClose?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelReplay, clearSignature, onClose]);

  const handleConfirm = useCallback(() => {
    if (!isValid || state !== "open") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set SVG viewBox to match canvas CSS dimensions
    const rect = canvas.getBoundingClientRect();
    setSvgViewBox(`0 0 ${rect.width} ${rect.height}`);
    resetSvg();

    setState("confirming");
    onProcessing?.();

    // Defer replay one frame so React re-renders the opacity fade first
    requestAnimationFrame(() => {
      replay(strokes, svgPathRef, () => {
        setTimeout(() => {
          setState("confirmed");
          onConfirmed?.();
        }, 300);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid, state, strokes, replay, clearSignature]);

  const handleTypeSubmit = useCallback(async () => {
    if (!typedName.trim() || state !== "open") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Generate strokes from typed text via skeletonization
    const rect = canvas.getBoundingClientRect();
    const generated = await generateStrokesFromText(typedName, rect.width, rect.height);
    if (generated.length === 0) return;

    setGeneratedStrokes(generated);
    setSvgViewBox(`0 0 ${rect.width} ${rect.height}`);
    resetSvg();

    setState("confirming");
    onProcessing?.();

    requestAnimationFrame(() => {
      replay(generated, svgPathRef, () => {
        setTimeout(() => {
          setState("confirmed");
          onConfirmed?.();
        }, 300);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typedName, state, replay]);

  const handleClear = () => {
    clearSignature();
    resetSvg();
  };

  const isOpen = state !== "closed";
  const isTypeReady = typedName.trim().length > 0;

  return (
    <div className="relative flex flex-col items-center w-full">
      {/* Backdrop — dismisses popup on outside click */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="popLayout">
        {!isOpen ? (
          // ── Trigger button ────────────────────────────────────────────────
          <motion.button
            layoutId="sig-widget"
            key="trigger"
            onClick={handleOpen}
            className="relative z-20 flex items-center overflow-hidden px-5 py-2.5 text-sm font-medium cursor-pointer"
            style={{
              borderRadius: 20,
              background: "#fff",
              color: "#0a0a0a",
            }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            exit={{ opacity: 0 }}
            transition={{ layout: SPRING, opacity: { duration: 0.12 } }}
          >
            <motion.div layout className="flex items-center gap-2">
              <PenIcon />
              <span>Add signature</span>
            </motion.div>
          </motion.button>
        ) : (
          // ── Popup card ────────────────────────────────────────────────────
          <motion.div
            layoutId="sig-widget"
            key="popup"
            className="relative z-20 overflow-hidden border"
            style={{
              borderRadius: 16,
              width: "100%",
              background: "var(--panel)",
              borderColor: "var(--border)",
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.04), 0 30px 60px rgba(0,0,0,0.6)",
            }}
            exit={{ opacity: 0 }}
            transition={{ layout: SPRING, opacity: { duration: 0.15 } }}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, delay: 0.14 }}
            >
              {state === "confirmed" ? (
                // ── Success state ────────────────────────────────────────────
                <motion.div
                  className="flex flex-col items-center justify-center gap-3 px-6 py-10"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={SPRING}
                >
                  <motion.div
                    className="flex h-10 w-10 items-center justify-center rounded-full"
                    style={{
                      background: "var(--success-bg)",
                      color: "var(--success)",
                    }}
                    initial={{ scale: 0, rotate: -15 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ ...SPRING, delay: 0.05 }}
                  >
                    <CheckIcon />
                  </motion.div>
                  <motion.p
                    className="text-sm font-medium"
                    style={{ color: "var(--text)" }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.18 }}
                  >
                    Signature added
                  </motion.p>
                  <motion.p
                    className="text-xs text-center"
                    style={{ color: "var(--text-muted)" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.28 }}
                  >
                    Your signature has been verified and saved.
                  </motion.p>
                </motion.div>
              ) : (
                // ── Drawing / confirming state ────────────────────────────
                <div className="flex flex-col" style={{ padding: "10px 0 6px" }}>
                  {/* Header */}
                  <div
                    className="flex items-center gap-2 px-3.5 pb-2"
                    style={{ color: "var(--text-muted)", fontSize: 13 }}
                  >
                    {mode === "type" ? <TypeIcon size={14} /> : <PenIcon size={14} />}
                    <span>{mode === "type" ? "Type signature" : "Draw signature"}</span>
                  </div>

                  {/* Canvas / input area */}
                  <Canvas
                    canvasRef={canvasRef}
                    svgRef={svgRef}
                    svgPathRef={svgPathRef}
                    svgViewBox={svgViewBox}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    calibrateCanvas={calibrateCanvas}
                    isReplaying={isReplaying}
                    signDuration={signDuration}
                    strokes={strokes}
                    mode={mode}
                    typedName={typedName}
                    onTypedNameChange={setTypedName}
                    onTypeSubmit={handleTypeSubmit}
                  />

                  {/* Footer */}
                  <div className="flex items-center justify-between px-2 pt-2">
                    {/* Secondary actions */}
                    <div className="flex items-center gap-1">
                      {/* Mode toggle */}
                      <AnimatePresence mode="wait" initial={false}>
                        {mode === "draw" ? (
                          <motion.button
                            key="type-icon"
                            initial={{ opacity: 0, filter: "blur(4px)" }}
                            animate={{ opacity: 1, filter: "blur(0px)" }}
                            exit={{ opacity: 0, filter: "blur(4px)" }}
                            transition={{ duration: 0.15 }}
                            onClick={() => {
                              setMode("type");
                              clearSignature();
                            }}
                            disabled={isReplaying}
                            className="flex h-8 w-8 items-center justify-center rounded-lg transition-opacity disabled:opacity-25 cursor-pointer hover:bg-white/5"
                            style={{ color: "var(--text-muted)" }}
                            title="Switch to type mode"
                          >
                            <TypeIcon />
                          </motion.button>
                        ) : (
                          <motion.button
                            key="squiggle-icon"
                            initial={{ opacity: 0, filter: "blur(4px)" }}
                            animate={{ opacity: 1, filter: "blur(0px)" }}
                            exit={{ opacity: 0, filter: "blur(4px)" }}
                            transition={{ duration: 0.15 }}
                            onClick={() => {
                              setMode("draw");
                              setTypedName("");
                            }}
                            disabled={isReplaying}
                            className="flex h-8 w-8 items-center justify-center rounded-lg transition-opacity disabled:opacity-25 cursor-pointer hover:bg-white/5"
                            style={{ color: "var(--text-muted)" }}
                            title="Switch to draw mode"
                          >
                            <SquiggleIcon />
                          </motion.button>
                        )}
                      </AnimatePresence>

                      {/* Eraser — draw mode only */}
                      {mode === "draw" && (
                        <button
                          onClick={handleClear}
                          disabled={isReplaying || strokes.length === 0}
                          className="flex h-8 w-8 items-center justify-center rounded-lg transition-opacity disabled:opacity-25 cursor-pointer hover:bg-white/5"
                          style={{ color: "var(--text-muted)" }}
                          title="Clear"
                        >
                          <EraseIcon />
                        </button>
                      )}
                    </div>

                    {/* Cancel + Confirm */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleClose}
                        disabled={isReplaying}
                        className="h-8 px-3 rounded-lg text-xs transition-opacity disabled:opacity-25 cursor-pointer hover:text-white/70"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Cancel
                      </button>

                      <motion.button
                        onClick={mode === "type" ? handleTypeSubmit : handleConfirm}
                        disabled={
                          mode === "type"
                            ? !isTypeReady || isReplaying
                            : !isValid || isReplaying
                        }
                        className="h-8 px-4 rounded-lg text-xs font-medium cursor-pointer disabled:cursor-not-allowed"
                        animate={{
                          background:
                            (mode === "type" ? isTypeReady : isValid) &&
                            !isReplaying
                              ? "#ffffff"
                              : "rgba(255,255,255,0.08)",
                          color:
                            (mode === "type" ? isTypeReady : isValid) &&
                            !isReplaying
                              ? "#0a0a0a"
                              : "rgba(255,255,255,0.3)",
                        }}
                        transition={{ duration: 0.22 }}
                      >
                        {isReplaying ? "Verifying…" : "Confirm"}
                      </motion.button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
