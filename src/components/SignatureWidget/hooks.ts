import { useRef, useState, useCallback, RefObject } from "react";

// ─── Data model ───────────────────────────────────────────────────────────────

export interface StrokePoint {
  x: number;
  y: number;
  time: number;
}

export interface Stroke {
  points: StrokePoint[];
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function isValidSignature(strokes: Stroke[]): boolean {
  const MIN_POINTS = 50;
  const MIN_DISTANCE = 100;

  let totalPoints = 0;
  let totalDistance = 0;

  for (const stroke of strokes) {
    totalPoints += stroke.points.length;
    for (let i = 1; i < stroke.points.length; i++) {
      const dx = stroke.points[i].x - stroke.points[i - 1].x;
      const dy = stroke.points[i].y - stroke.points[i - 1].y;
      totalDistance += Math.hypot(dx, dy);
    }
  }

  return totalPoints >= MIN_POINTS && totalDistance >= MIN_DISTANCE;
}

// ─── Canvas capture ───────────────────────────────────────────────────────────

export function useSignatureCapture(
  canvasRef: RefObject<HTMLCanvasElement | null>
) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const isDrawing = useRef(false);
  const rafId = useRef<number | null>(null);
  const pendingStrokesRef = useRef<Stroke[]>([]);

  const getScaledPoint = useCallback(
    (e: PointerEvent): StrokePoint | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      // Store CSS-space coordinates so they match the SVG viewBox
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        time: Date.now(),
      };
    },
    [canvasRef]
  );

  const calibrateCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
  }, [canvasRef]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    for (const stroke of pendingStrokesRef.current) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  }, [canvasRef]);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      const point = getScaledPoint(e);
      if (!point) return;
      isDrawing.current = true;
      const newStroke: Stroke = { points: [point] };
      pendingStrokesRef.current = [...pendingStrokesRef.current, newStroke];
      setStrokes([...pendingStrokesRef.current]);

      const loop = () => {
        redrawCanvas();
        if (isDrawing.current) rafId.current = requestAnimationFrame(loop);
      };
      rafId.current = requestAnimationFrame(loop);
    },
    [getScaledPoint, redrawCanvas]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDrawing.current) return;
      const point = getScaledPoint(e);
      if (!point) return;
      const last =
        pendingStrokesRef.current[pendingStrokesRef.current.length - 1];
      if (!last) return;
      last.points.push(point);
      setStrokes([...pendingStrokesRef.current]);
    },
    [getScaledPoint]
  );

  const onPointerUp = useCallback(() => {
    isDrawing.current = false;
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    redrawCanvas();
  }, [redrawCanvas]);

  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    }
    pendingStrokesRef.current = [];
    setStrokes([]);
  }, [canvasRef]);

  const getSignatureDuration = useCallback((): number => {
    if (pendingStrokesRef.current.length === 0) return 0;
    const first = pendingStrokesRef.current[0].points[0]?.time ?? 0;
    const lastStroke =
      pendingStrokesRef.current[pendingStrokesRef.current.length - 1];
    const last =
      lastStroke.points[lastStroke.points.length - 1]?.time ?? 0;
    return (last - first) / 1000;
  }, []);

  return {
    strokes,
    calibrateCanvas,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    clearSignature,
    getSignatureDuration,
  };
}

// ─── Generate strokes from typed text ─────────────────────────────────────────

export function generateStrokesFromText(
  name: string,
  width: number,
  height: number
): Stroke[] {
  if (typeof document === "undefined") return [];

  const scale = 2;
  const cw = Math.ceil(width * scale);
  const ch = Math.ceil(height * scale);

  const offscreen = document.createElement("canvas");
  offscreen.width = cw;
  offscreen.height = ch;
  const ctx = offscreen.getContext("2d");
  if (!ctx) return [];

  const fontSize = height * 0.55 * scale;
  ctx.font = `700 ${fontSize}px "Dancing Script", cursive`;
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(name, cw / 2, ch * 0.68);

  const { data } = ctx.getImageData(0, 0, cw, ch);

  // ─── Column scan: largest continuous ink cluster centroid ─────────────
  // Using the longest run per column avoids the jagged-spike problem of
  // median-Y, which gets pulled toward ascenders/descenders when multiple
  // ink regions exist in the same column (e.g. S-curves, e-loops).
  const GAP_PX = Math.ceil(8 * scale); // 8 CSS px gap → new stroke

  type RawPt = { x: number; y: number };
  const rawStrokes: RawPt[][] = [];
  let current: RawPt[] | null = null;
  let gap = 0;

  for (let col = 0; col < cw; col++) {
    // Find the longest continuous ink run in this column
    let bestStart = -1;
    let bestLen = 0;
    let curStart = -1;
    let curLen = 0;

    for (let row = 0; row < ch; row++) {
      if (data[(row * cw + col) * 4 + 3] > 64) {
        if (curStart === -1) curStart = row;
        curLen++;
        if (curLen > bestLen) {
          bestLen = curLen;
          bestStart = curStart;
        }
      } else {
        curStart = -1;
        curLen = 0;
      }
    }

    if (bestLen > 0) {
      gap = 0;
      const clusterCenterY = bestStart + bestLen / 2;
      const pt: RawPt = {
        x: col / scale,
        y: clusterCenterY / scale,
      };
      if (!current) {
        current = [pt];
        rawStrokes.push(current);
      } else {
        current.push(pt);
      }
    } else {
      gap++;
      if (current && gap >= GAP_PX) current = null;
    }
  }

  // ─── 20-point Y moving average (uses original values to avoid compounding) ──
  const SMOOTH = 20;
  for (const pts of rawStrokes) {
    const origY = pts.map((p) => p.y);
    for (let i = 0; i < pts.length; i++) {
      const lo = Math.max(0, i - SMOOTH);
      const hi = Math.min(pts.length - 1, i + SMOOTH);
      let sumY = 0;
      for (let j = lo; j <= hi; j++) sumY += origY[j];
      pts[i] = { x: pts[i].x, y: sumY / (hi - lo + 1) };
    }
  }

  // ─── Distance-proportional timestamps over 2000 ms ───────────────────
  const TOTAL_MS = 2000;
  let totalDist = 0;
  const cumDists: number[][] = rawStrokes.map((pts) => {
    const d = [0];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      d.push(d[d.length - 1] + Math.hypot(dx, dy));
    }
    totalDist += d[d.length - 1];
    return d;
  });

  const now = Date.now();
  let runDist = 0;
  return rawStrokes.map((pts, si) => {
    const dists = cumDists[si];
    const points: StrokePoint[] = pts.map((pt, pi) => ({
      x: pt.x,
      y: pt.y,
      time:
        now +
        (totalDist > 0 ? ((runDist + dists[pi]) / totalDist) * TOTAL_MS : 0),
    }));
    runDist += dists[dists.length - 1];
    return { points };
  });
}

export function getStrokeDuration(strokes: Stroke[]): number {
  if (!strokes.length) return 0;
  const first = strokes[0].points[0]?.time ?? 0;
  const lastStroke = strokes[strokes.length - 1];
  const last = lastStroke.points[lastStroke.points.length - 1]?.time ?? 0;
  return (last - first) / 1000;
}

// ─── SVG timing-accurate replay ───────────────────────────────────────────────

interface ReplayPoint {
  x: number;
  y: number;
  relativeTime: number;
  isNewStroke: boolean;
}

function buildPathFromPoints(points: ReplayPoint[], count: number): string {
  let d = "";
  for (let i = 0; i < count; i++) {
    const p = points[i];
    d += `${p.isNewStroke ? "M" : "L"} ${p.x} ${p.y} `;
  }
  return d;
}

export function useSignatureReplay() {
  const rafId = useRef<number | null>(null);

  const replay = useCallback(
    (
      strokes: Stroke[],
      svgPathRef: RefObject<SVGPathElement | null>,
      onComplete: () => void
    ) => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);

      // Flatten all points with relative times
      const startTime = strokes[0]?.points[0]?.time ?? Date.now();
      const allPoints: ReplayPoint[] = [];

      for (const stroke of strokes) {
        stroke.points.forEach((p, i) => {
          allPoints.push({
            x: p.x,
            y: p.y,
            relativeTime: p.time - startTime,
            isNewStroke: i === 0,
          });
        });
      }

      allPoints.sort((a, b) => a.relativeTime - b.relativeTime);

      let currentIndex = 0;
      const replayStart = performance.now();

      const frame = (now: number) => {
        const elapsed = now - replayStart;

        // Advance to all points whose time has passed
        while (
          currentIndex < allPoints.length &&
          allPoints[currentIndex].relativeTime <= elapsed
        ) {
          currentIndex++;
        }

        const path = svgPathRef.current;
        if (path) {
          path.setAttribute(
            "d",
            buildPathFromPoints(allPoints, currentIndex)
          );
        }

        if (currentIndex < allPoints.length) {
          rafId.current = requestAnimationFrame(frame);
        } else {
          rafId.current = null;
          onComplete();
        }
      };

      rafId.current = requestAnimationFrame(frame);
    },
    []
  );

  const cancelReplay = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }, []);

  return { replay, cancelReplay };
}
