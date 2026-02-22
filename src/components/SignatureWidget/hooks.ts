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
