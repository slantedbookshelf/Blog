export type Pt = { x: number; y: number }

/** A small deterministic hash → [0, 1), so every render lays the cord down the same way. */
export const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

const round = (v: number): number => Math.round(v * 100) / 100

export const clamp01 = (v: number): number => (v > 0 ? (v < 1 ? v : 1) : 0)

export const polyLength = (pts: Pt[]): number => {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return l
}

/** Resamples a polyline into `n` equal-length segments (n + 1 points), first and last kept exactly. */
export const resample = (pts: Pt[], n: number): Pt[] => {
  const segs = Math.max(1, Math.floor(n) || 1)
  if (!pts.length) return []
  if (pts.length === 1) return Array.from({ length: segs + 1 }, () => ({ ...pts[0] }))
  const total = polyLength(pts)
  const out: Pt[] = [{ ...pts[0] }]
  let j = 1
  let acc = 0
  for (let i = 1; i < segs; i++) {
    const want = (total * i) / segs
    while (j < pts.length - 1 && acc + Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y) < want) {
      acc += Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y)
      j++
    }
    const a = pts[j - 1]
    const b = pts[j]
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const t = Math.min(1, Math.max(0, (want - acc) / l))
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  out.push({ ...pts[pts.length - 1] })
  return out
}

/**
 * The tied cord: anchored in the bottom grommet, once round it, up across the
 * seam, round the top grommet, down across (the strands cross at the middle),
 * round the bottom again, up once more, and half round the top, where the end
 * tucks off to the upper right. `rho` is how far out from each grommet centre
 * the cord wraps.
 */
export const tiePath = (top: Pt, bottom: Pt, rho: number, tail: number, step: number = 4): Pt[] => {
  const dx = bottom.x - top.x
  const dy = bottom.y - top.y
  const D = Math.hypot(dx, dy) || 1
  const u = { x: dx / D, y: dy / D }
  const v = { x: u.y, y: -u.x }
  // Keep the cord clear of the grommets even when the buttons sit close together.
  const r = Math.max(1, Math.min(rho, D * 0.42))
  const at = (c: Pt, rad: number, th: number): Pt => ({
    x: c.x + rad * (Math.cos(th) * u.x + Math.sin(th) * v.x),
    y: c.y + rad * (Math.cos(th) * u.y + Math.sin(th) * v.y),
  })
  const pts: Pt[] = [{ ...bottom }]
  const arc = (c: Pt, rad: number, a0: number, a1: number) => {
    const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * rad) / step))
    for (let i = 1; i <= n; i++) pts.push(at(c, rad, a0 + ((a1 - a0) * i) / n))
  }
  const line = (b: Pt) => {
    const a = pts[pts.length - 1]
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
    for (let i = 1; i <= n; i++) pts.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n })
  }
  // θ is measured from "away from the top button" (down the axis), positive to its right.
  // The crossing strands leave each grommet where they're tangent from the midpoint.
  const tan = (rad: number) => Math.acos(Math.min(1, rad / (D / 2)))
  const PI = Math.PI
  const r1 = r
  const r2 = r * 1.16
  const a1 = tan(r1)
  const a2 = tan(r2)
  // the anchor stitch, then under the bottom grommet
  line(at(bottom, r1, -PI / 2))
  arc(bottom, r1, -PI / 2, PI - a1)
  // up across the middle, then over the top grommet
  line(at(top, r1, -a1))
  arc(top, r1, -a1, a1 - 2 * PI)
  // down across the middle (the strands cross here), under the bottom again
  line(at(bottom, r2, -PI + a2))
  arc(bottom, r2, -PI + a2, PI - a2)
  // up once more, and half over the top
  line(at(top, r2, -a2))
  arc(top, r2, -a2, -1.25 * PI)
  // the free end tucks off to the upper right
  const end = pts[pts.length - 1]
  const out = at(top, r2 + tail * 0.5, -1.32 * PI)
  const tip = { x: out.x + (v.x * 0.85 - u.x * 0.35) * tail * 0.6, y: out.y + (v.y * 0.85 - u.y * 0.35) * tail * 0.6 }
  const n = Math.max(2, Math.ceil(tail / step))
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const m = 1 - t
    pts.push({
      x: m * m * end.x + 2 * m * t * out.x + t * t * tip.x,
      y: m * m * end.y + 2 * m * t * out.y + t * t * tip.y,
    })
  }
  return pts
}

export type Box = { left: number; top: number; right: number; bottom: number }

/**
 * Where the cord lies once it's untied: a loose, loopy string dropped on the
 * table from the anchor, `length` long, drifting along `angle` (radians,
 * 0 = right, π/2 = down). The loops are uneven like a real dropped cord, and
 * every point is kept inside `box`.
 */
export const restPath = (anchor: Pt, length: number, size: number, box: Box, angle: number = 1.05, seed: number = 1, step: number = 3): Pt[] => {
  const pts: Pt[] = [{ ...anchor }]
  const L = Math.max(0, length)
  const b = size * 0.75 // loop radius
  const a = size * 0.26 // advance per radian
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const clampIn = (p: Pt): Pt => ({
    x: Math.min(box.right, Math.max(box.left, p.x)),
    y: Math.min(box.bottom, Math.max(box.top, p.y)),
  })
  // A prolate trochoid (a rolling-circle curve with loops), bent slowly and wobbled.
  let t = 0
  let len = 0
  let prev: Pt = { ...anchor }
  let guard = 0
  while (len < L && guard++ < 20000) {
    t += step / Math.max(1, Math.hypot(a, b))
    const wob = 1 + (hash(Math.floor(t / 6.283) * 3.1 + seed) - 0.5) * 0.5
    const bend = Math.sin(t * 0.18 + seed) * 0.28
    const lx = a * t - b * wob * Math.sin(t)
    const ly = b * wob * (1 - Math.cos(t)) * 0.8
    const cb = Math.cos(bend)
    const sb = Math.sin(bend)
    const rx = lx * cb - ly * sb
    const ry = lx * sb + ly * cb
    const p = clampIn({ x: anchor.x + rx * c - ry * s, y: anchor.y + rx * s + ry * c })
    const d = Math.hypot(p.x - prev.x, p.y - prev.y)
    if (d < 0.01) continue
    if (len + d > L) {
      const k = (L - len) / d
      pts.push({ x: prev.x + (p.x - prev.x) * k, y: prev.y + (p.y - prev.y) * k })
      len = L
      break
    }
    pts.push(p)
    len += d
    prev = p
  }
  // Ran out of room (everything clamped flat): pad along the edge so the length still holds.
  while (len < L - 0.01 && guard++ < 40000) {
    const p = clampIn({ x: prev.x - Math.min(step, L - len), y: prev.y })
    const d = Math.hypot(p.x - prev.x, p.y - prev.y)
    if (d < 0.01) break
    pts.push(p)
    len += d
    prev = p
  }
  return pts
}

/** A smooth SVG path through the points (quadratic midpoints). */
export const smoothPath = (xs: ArrayLike<number>, ys: ArrayLike<number>): string => {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return ""
  let d = "M" + round(xs[0]) + " " + round(ys[0])
  for (let i = 1; i < n - 1; i++) {
    d += "Q" + round(xs[i]) + " " + round(ys[i]) + " " + round((xs[i] + xs[i + 1]) / 2) + " " + round((ys[i] + ys[i + 1]) / 2)
  }
  return d + "L" + round(xs[n - 1]) + " " + round(ys[n - 1])
}

/**
 * How far the footer has scrolled in, 0 → 1: 0 while its top is still below
 * the fold, 1 once it has risen by most of a screen (or its own height, if
 * that's less). A footer already on screen reads 1.
 */
export const scrollProgress = (top: number, height: number, viewport: number): number => {
  if (!(viewport > 0) || !Number.isFinite(top)) return 1
  const span = Math.max(1, Math.min(Number.isFinite(height) && height > 0 ? height : viewport, viewport) * 0.7)
  return clamp01((viewport - top) / span)
}

/** Eases `wind` toward `target`, never faster than `rate` per second. */
export const stepWind = (wind: number, target: number, dt: number, rate: number): number => {
  const want = (target - wind) * (1 - Math.exp(-Math.max(0, dt) * 5))
  const cap = Math.max(0, rate) * Math.max(0, dt)
  const next = wind + Math.max(-cap, Math.min(cap, want))
  return Math.abs(target - next) < 0.0005 ? target : clamp01(next)
}

export type Rope = {
  x: Float64Array
  y: Float64Array
  px: Float64Array
  py: Float64Array
  /** Rest length of one segment. */
  seg: number
}

export const makeRope = (pts: Pt[]): Rope => {
  const n = pts.length
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  pts.forEach((p, i) => {
    x[i] = p.x
    y[i] = p.y
  })
  return { x, y, px: Float64Array.from(x), py: Float64Array.from(y), seg: n > 1 ? polyLength(pts) / (n - 1) : 0 }
}

/**
 * One fixed step of the cord. It lies flat on a table, so there's no gravity,
 * only friction. Points below `locked` are wound on and ease onto `tied`; the
 * rest are free, drift gently toward `rest` while `attract` is on, and are kept
 * one segment apart. `drag` pins one point to the pointer.
 */
export const stepRope = (
  r: Rope,
  tied: Pt[],
  rest: Pt[],
  locked: number,
  attract: number,
  drag: { i: number; x: number; y: number } | null = null,
  iterations: number = 12,
): void => {
  const n = r.x.length
  const lockN = Math.max(1, Math.min(n, Math.floor(locked)))
  const pinned = (i: number) => i < lockN || (drag !== null && drag.i === i)
  for (let i = 0; i < n; i++) {
    if (drag && drag.i === i) {
      r.px[i] = r.x[i]
      r.py[i] = r.y[i]
      r.x[i] = drag.x
      r.y[i] = drag.y
    } else if (i < lockN) {
      const t = tied[i]
      r.px[i] = r.x[i]
      r.py[i] = r.y[i]
      if (t) {
        // The anchor never moves; the rest snug on quickly but not instantly.
        const k = i === 0 ? 1 : 0.24
        r.x[i] += (t.x - r.x[i]) * k
        r.y[i] += (t.y - r.y[i]) * k
      }
    } else {
      const vx = (r.x[i] - r.px[i]) * 0.9
      const vy = (r.y[i] - r.py[i]) * 0.9
      r.px[i] = r.x[i]
      r.py[i] = r.y[i]
      r.x[i] += vx
      r.y[i] += vy
      const q = rest[i]
      if (q && attract > 0) {
        r.x[i] += (q.x - r.x[i]) * attract
        r.y[i] += (q.y - r.y[i]) * attract
      }
    }
  }
  const seg = r.seg
  for (let k = 0; k < iterations; k++) {
    for (let i = 0; i < n - 1; i++) {
      const a = pinned(i)
      const b = pinned(i + 1)
      if (a && b) continue
      const dx = r.x[i + 1] - r.x[i]
      const dy = r.y[i + 1] - r.y[i]
      const d = Math.hypot(dx, dy) || 1e-6
      const diff = (d - seg) / d
      if (a) {
        r.x[i + 1] -= dx * diff
        r.y[i + 1] -= dy * diff
      } else if (b) {
        r.x[i] += dx * diff
        r.y[i] += dy * diff
      } else {
        r.x[i] += dx * diff * 0.5
        r.y[i] += dy * diff * 0.5
        r.x[i + 1] -= dx * diff * 0.5
        r.y[i + 1] -= dy * diff * 0.5
      }
    }
  }
}

/** The nearest free point to (x, y) within `reach`, or -1. */
export const nearestFree = (r: Rope, x: number, y: number, locked: number, reach: number): number => {
  let best = -1
  let bd = reach * reach
  for (let i = Math.max(1, Math.floor(locked)); i < r.x.length; i++) {
    const d = (r.x[i] - x) ** 2 + (r.y[i] - y) ** 2
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return best
}

