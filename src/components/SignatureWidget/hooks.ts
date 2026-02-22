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

// ─── Preload signature font ──────────────────────────────────────────────────

export function preloadSignatureFont(): void {
  if (typeof window === "undefined") return;
  const cssSize = Math.max(24, Math.min(40, window.innerWidth * 0.07));
  document.fonts.load(`700 ${cssSize}px "Dancing Script"`).catch(() => {});
}

// ─── Stroke duration helper ──────────────────────────────────────────────────

export function getStrokeDuration(strokes: Stroke[]): number {
  if (strokes.length === 0) return 0;
  const first = strokes[0].points[0]?.time ?? 0;
  const lastStroke = strokes[strokes.length - 1];
  const last = lastStroke.points[lastStroke.points.length - 1]?.time ?? 0;
  return (last - first) / 1000;
}

// ─── Text → Strokes via Zhang-Suen skeletonization ──────────────────────────

const SKEL_UPSCALE = 2;
const TARGET_DRAW_DURATION = 2; // seconds

export async function generateStrokesFromText(
  text: string,
  canvasWidth: number,
  canvasHeight: number
): Promise<Stroke[]> {
  const w = Math.floor(canvasWidth * SKEL_UPSCALE);
  const h = Math.floor(canvasHeight * SKEL_UPSCALE);

  // Ensure font is loaded
  const cssSize = Math.max(24, Math.min(40, window.innerWidth * 0.07));
  await document.fonts.load(`700 ${cssSize}px "Dancing Script"`);

  // Render text to offscreen canvas
  const offscreen = document.createElement("canvas");
  offscreen.width = w;
  offscreen.height = h;
  const ctx = offscreen.getContext("2d");
  if (!ctx) return [];

  const fontSize = cssSize * SKEL_UPSCALE;
  ctx.font = `700 ${fontSize}px "Dancing Script"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "white";
  ctx.fillText(text, w / 2, h / 2);

  // Binarize using alpha channel
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;
  const grid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    grid[i] = pixels[i * 4 + 3] > 128 ? 1 : 0;
  }

  // Find bounding box
  let minX = w,
    maxX = 0,
    minY = h,
    maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x]) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return [];

  // Pad by 1px
  minX = Math.max(0, minX - 1);
  minY = Math.max(0, minY - 1);
  maxX = Math.min(w - 1, maxX + 1);
  maxY = Math.min(h - 1, maxY + 1);

  // Extract sub-grid for thinning (reduces work area)
  const sw = maxX - minX + 1;
  const sh = maxY - minY + 1;
  const sub = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      sub[y * sw + x] = grid[(y + minY) * w + (x + minX)];
    }
  }

  // Zhang-Suen thinning
  zhangSuenThin(sub, sw, sh);

  // Trace skeleton into paths
  const rawPaths = traceSkeleton(sub, sw, sh);

  // Convert to CSS-space coordinates
  const cssPaths = rawPaths.map((path) =>
    path.map((p) => ({
      x: (p.x + minX) / SKEL_UPSCALE,
      y: (p.y + minY) / SKEL_UPSCALE,
    }))
  );

  // Simplify with Ramer-Douglas-Peucker
  const simplified = cssPaths
    .map((path) => rdpSimplify(path, 0.5))
    .filter((p) => p.length >= 2);

  // Sort paths left-to-right
  simplified.sort((a, b) => a[0].x - b[0].x);

  // Assign timestamps and return as Stroke[]
  return assignTimestamps(simplified, TARGET_DRAW_DURATION);
}

// ── Zhang-Suen thinning algorithm ────────────────────────────────────────────

function zhangSuenThin(grid: Uint8Array, w: number, h: number): void {
  let changed = true;
  while (changed) {
    changed = false;

    // Sub-iteration 1
    const remove1: number[] = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!grid[y * w + x]) continue;
        const p = neighbors8(grid, w, x, y);
        const B = p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + p[7];
        if (B < 2 || B > 6) continue;
        if (transitions01(p) !== 1) continue;
        if (p[0] * p[2] * p[4] !== 0) continue; // P2·P4·P6
        if (p[2] * p[4] * p[6] !== 0) continue; // P4·P6·P8
        remove1.push(y * w + x);
      }
    }
    for (const idx of remove1) {
      grid[idx] = 0;
      changed = true;
    }

    // Sub-iteration 2
    const remove2: number[] = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!grid[y * w + x]) continue;
        const p = neighbors8(grid, w, x, y);
        const B = p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + p[7];
        if (B < 2 || B > 6) continue;
        if (transitions01(p) !== 1) continue;
        if (p[0] * p[2] * p[6] !== 0) continue; // P2·P4·P8
        if (p[0] * p[4] * p[6] !== 0) continue; // P2·P6·P8
        remove2.push(y * w + x);
      }
    }
    for (const idx of remove2) {
      grid[idx] = 0;
      changed = true;
    }
  }
}

/** Clockwise neighbors: P2(top), P3(TR), P4(R), P5(BR), P6(B), P7(BL), P8(L), P9(TL) */
function neighbors8(
  grid: Uint8Array,
  w: number,
  x: number,
  y: number
): number[] {
  return [
    grid[(y - 1) * w + x], // P2
    grid[(y - 1) * w + x + 1], // P3
    grid[y * w + x + 1], // P4
    grid[(y + 1) * w + x + 1], // P5
    grid[(y + 1) * w + x], // P6
    grid[(y + 1) * w + x - 1], // P7
    grid[y * w + x - 1], // P8
    grid[(y - 1) * w + x - 1], // P9
  ];
}

/** Count 0→1 transitions in the ordered sequence P2..P9,P2 */
function transitions01(p: number[]): number {
  let c = 0;
  for (let i = 0; i < 8; i++) if (p[i] === 0 && p[(i + 1) % 8] === 1) c++;
  return c;
}

// ── Skeleton path tracing ────────────────────────────────────────────────────

interface Pt {
  x: number;
  y: number;
}

function traceSkeleton(grid: Uint8Array, w: number, h: number): Pt[][] {
  const visited = new Uint8Array(w * h);
  const paths: Pt[][] = [];
  const DX = [1, 1, 0, -1, -1, -1, 0, 1];
  const DY = [0, 1, 1, 1, 0, -1, -1, -1];

  function nCount(x: number, y: number): number {
    let c = 0;
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d],
        ny = y + DY[d];
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && grid[ny * w + nx]) c++;
    }
    return c;
  }

  function trace(sx: number, sy: number): Pt[] {
    const path: Pt[] = [{ x: sx, y: sy }];
    visited[sy * w + sx] = 1;
    let cx = sx,
      cy = sy,
      pdx = 1,
      pdy = 0;

    while (true) {
      let bestX = -1,
        bestY = -1,
        bestDot = -Infinity;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d],
          ny = cy + DY[d];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        if (!grid[ny * w + nx] || visited[ny * w + nx]) continue;
        const dot = DX[d] * pdx + DY[d] * pdy;
        if (dot > bestDot) {
          bestDot = dot;
          bestX = nx;
          bestY = ny;
        }
      }
      if (bestX === -1) break;
      pdx = bestX - cx;
      pdy = bestY - cy;
      visited[bestY * w + bestX] = 1;
      path.push({ x: bestX, y: bestY });
      cx = bestX;
      cy = bestY;
    }
    return path;
  }

  // Collect endpoints (1 neighbor), sorted left-to-right
  const endpoints: Pt[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] && nCount(x, y) === 1) endpoints.push({ x, y });
    }
  }
  endpoints.sort((a, b) => a.x - b.x || a.y - b.y);

  // Trace from endpoints first
  for (const ep of endpoints) {
    if (visited[ep.y * w + ep.x]) continue;
    const p = trace(ep.x, ep.y);
    if (p.length >= 3) paths.push(p);
  }

  // Pick up remaining (loops)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] && !visited[y * w + x]) {
        const p = trace(x, y);
        if (p.length >= 3) paths.push(p);
      }
    }
  }

  return paths;
}

// ── Ramer-Douglas-Peucker simplification ─────────────────────────────────────

function rdpSimplify(points: Pt[], epsilon: number): Pt[] {
  if (points.length <= 2) return [...points];

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [s, e] = stack.pop()!;
    let maxD = 0,
      maxI = s;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(points[i], points[s], points[e]);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > epsilon) {
      keep[maxI] = 1;
      if (maxI - s > 1) stack.push([s, maxI]);
      if (e - maxI > 1) stack.push([maxI, e]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq)
  );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ── Timestamp assignment ─────────────────────────────────────────────────────

function assignTimestamps(paths: Pt[][], totalDuration: number): Stroke[] {
  let totalLen = 0;
  const lens: number[] = paths.map((path) => {
    let l = 0;
    for (let i = 1; i < path.length; i++)
      l += Math.hypot(
        path[i].x - path[i - 1].x,
        path[i].y - path[i - 1].y
      );
    totalLen += l;
    return l;
  });

  if (totalLen === 0) return [];

  const now = Date.now();
  const ms = totalDuration * 1000;
  let elapsed = 0;

  return paths.map((path, pi) => {
    const pLen = lens[pi];
    const pDur = (pLen / totalLen) * ms;
    let pElapsed = 0;

    const points: StrokePoint[] = path.map((p, i) => {
      if (i > 0) {
        const seg = Math.hypot(
          p.x - path[i - 1].x,
          p.y - path[i - 1].y
        );
        pElapsed += pLen > 0 ? (seg / pLen) * pDur : 0;
      }
      return { x: p.x, y: p.y, time: now + elapsed + pElapsed };
    });

    elapsed += pDur + 50; // 50ms gap between strokes
    return { points };
  });
}

// ─── SVG timing-accurate replay ───────────────────────────────────────────────

interface ReplayPoint {
  x: number;
  y: number;
  relativeTime: number;
  isNewStroke: boolean;
}

function buildPathFromPoints(points: ReplayPoint[], count: number): string {
  if (count === 0) return "";

  // Group visible points into sub-strokes
  const subStrokes: ReplayPoint[][] = [];
  for (let i = 0; i < count; i++) {
    if (points[i].isNewStroke || subStrokes.length === 0) {
      subStrokes.push([]);
    }
    subStrokes[subStrokes.length - 1].push(points[i]);
  }

  let d = "";
  for (const stroke of subStrokes) {
    if (stroke.length === 0) continue;
    d += `M ${stroke[0].x} ${stroke[0].y} `;
    if (stroke.length < 3) {
      for (let i = 1; i < stroke.length; i++) {
        d += `L ${stroke[i].x} ${stroke[i].y} `;
      }
      continue;
    }
    // Catmull-Rom → cubic Bézier for smooth curves through every point
    for (let i = 0; i < stroke.length - 1; i++) {
      const p0 = stroke[Math.max(0, i - 1)];
      const p1 = stroke[i];
      const p2 = stroke[i + 1];
      const p3 = stroke[Math.min(stroke.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += `C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y} `;
    }
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
