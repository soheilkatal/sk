import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";
import * as G from "./kit/lathe.mjs";
import * as M from "./model.mjs";
import { makeParts } from "./parts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const WIDTH = 600;
const HEIGHT = 560;

// Layout in millimetres: x across the engine, y front (+) to back (-), z up. The cut is the plane y = 0.
const BACK = -55;
const XI = -23;
const XE = 24;
const RI = 17;
const RE = 14;
const HEAD_TOP = M.HEAD + 100;
const CAM_R = 18;
const V = {
  XI,
  XE,
  CAM_R,
  SHAFT_R: 11,
  CAM_Z: HEAD_TOP + CAM_R,
  SEAT_Z: M.ROOF + 26,
  RETAINER_Z: HEAD_TOP - 22,
  SPRING_R: 10.5,
  BELT_Y: -62,
  CAM_TEETH_R: 23,
  CRANK_TEETH_R: 11.5,
};

const P = k.fitProjection(
  [
    ...k.boxCorners({ x: -175, y: -100, w: 350, d: 175 }, -20, 0),
    [0, BACK, V.CAM_Z + 30],
    [XE, 14, V.CAM_Z + 28],
    [-150, -10, HEAD_TOP + 40],
  ],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 60, elevation: 24 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const Fy = (x, z) => G.frameOf([x, 0, z], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const Fz = (x, y, z) => G.frameOf([x, y, z], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const Fx = (y, z) => G.frameOf([0, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const parts = makeParts(k, G, M, P, V);
const { circle, onY } = parts;
const face = (points, cls, tone = "lo") => `<path class="${cls}" d="${onY(points, 0, true)}"/>` + L(onY(points, 0, true), { tone });

function ribbon(centre, half) {
  const left = [];
  const right = [];
  centre.forEach(([x, z], i) => {
    const [ax, az] = centre[Math.max(0, i - 1)];
    const [bx, bz] = centre[Math.min(centre.length - 1, i + 1)];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    const h = typeof half === "function" ? half(i / (centre.length - 1)) : half;
    left.push([x + nx * h, z + nz * h]);
    right.push([x - nx * h, z - nz * h]);
  });
  return [...left, ...right.reverse()];
}

function smoothLine(points, per = 8) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// ---------- the bench ----------
const PLATE = { x: -175, y: -100, w: 350, d: 175, r: 10 };
function bench() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -20, 14, P)}"/>`];
  for (const [x, y] of k.corners(PLATE, 24)) {
    out.push(S(k.cylinder(x, y, 9, -20, 2, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 7, -18, 4, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -14, 14, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 6), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 12);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 3, 0, P, 18)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.55 }));
  const strip = { x: -150, y: PLATE.y + PLATE.d - 20, w: 300, d: 9, r: 1.2 };
  out.push(S(k.slabOf(strip, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 5, strip.x + strip.w - 5, 5, 5, strip.y + 1, 0.8, [2.6, 5], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2.5, strip.y + 4.5, 0.8]), at([strip.x + strip.w - 2.5, strip.y + 4.5, 0.8])], { size: 0.5 }));
  // engine mounts: a steel cradle with a rubber pad under the sump
  for (const x of [-38, 38]) {
    const foot = { x: x - 16, y: -52, w: 32, d: 46, r: 2 };
    out.push(S(k.slabOf(foot, 0, 6, P, 3, 0.6), { tone: "mid" }));
    out.push(D(k.corners(foot, 5).map(([a, b]) => at([a, b, 6])), { size: 0.55, tone: "hi" }));
    out.push(S(k.slabOf(k.insetPlan(foot, 6), 6, 18, P, 3, 0.5), { tone: "mid" }));
    out.push(S(k.slabOf(k.insetPlan(foot, 4), 24, 8, P, 4), { tone: "lo", crease: "none", inner: L(k.sideSeam(k.insetPlan(foot, 4), 28, P, 4), { tone: "faint" }) }));
  }
  return out.join("");
}

// The label plate with four stroke lamps, front right of the bench.
const LABEL = { x: 70, y: 22, w: 84, d: 34, r: 2 };
const LAMPS = [0, 1, 2, 3].map((i) => [LABEL.x + 14 + i * 18.5, LABEL.y + 13]);
function label() {
  const out = [S(k.slabOf(LABEL, 0, 3, P, 3, 0.5), { tone: "mid" })];
  out.push(L(k.planOutline(k.insetPlan(LABEL, 2.5), 3, P, 3), { tone: "faint" }));
  out.push(D(k.corners(LABEL, 4).map(([x, y]) => at([x, y, 3])), { size: 0.5 }));
  LAMPS.forEach(([x, y], i) => {
    out.push(S(k.cylinder(x, y, 5.2, 3, 2, P, 24), { tone: "mid" }));
    out.push(`<path class="eng-lamp" data-lamp="${i}" d="${k.ring(x, y, 3.6, 5, P, 24)}"/>`);
    out.push(L(k.ring(x, y, 3.6, 5, P, 24), { tone: "lo" }));
  });
  for (const [i, z] of [[0, 0], [1, 1]]) out.push(L(k.lineOnTop([LABEL.x + 8, LABEL.y + 24 + i * 4], [LABEL.x + (i ? 52 : 70), LABEL.y + 24 + i * 4], 3, P), { tone: "lo", free: true }));
  out.push(k.faceTextSvg(k.topMatrix([LABEL.x + LABEL.w - 8, LABEL.y + 29], 3, P, "x"), "86 × 86", { size: 4.2, tone: "mid", anchor: "end" }));
  return out.join("");
}

// ---------- the engine, back half (static) ----------
const U = (outer, inner, half = 0) => [
  [-outer, 0],
  [-outer, BACK],
  [outer, BACK],
  [outer, 0],
  [inner, 0],
  [inner, BACK + 10],
  [-inner, BACK + 10],
  [-inner, 0],
];

function bore() {
  const ring = [[-70, 0], [-70, BACK], [70, BACK], [70, 0]];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI;
    ring.push([43 * Math.cos(a), -43 * Math.sin(a)]);
  }
  return ring;
}

function lower() {
  const out = [];
  // sump
  out.push(S(k.slabOf({ x: -56, y: BACK + 4, w: 112, d: -BACK - 4, r: 4 }, 34, 4, P, 4), { tone: "mid" }));
  out.push(S(k.extrude(U(56, 49).map(([x, y]) => [x, y === BACK ? BACK + 4 : y === BACK + 10 ? BACK + 11 : y]), 38, 22, P, { convex: false }), { tone: "mid" }));
  out.push(S(k.extrude(U(74, 49).map(([x, y]) => [x, y === BACK + 10 ? BACK + 11 : y]), 60, 5, P, { convex: false }), { tone: "mid", crease: "lo" }));
  const flange = [-66, -46, 46, 66].map((x) => at([x, BACK + 4, 65]));
  out.push(D(flange, { size: 0.6, tone: "hi" }));
  out.push(D([-66, 66].map((x) => at([x, -6, 65])), { size: 0.6, tone: "hi" }));
  // drain plug on the sump side
  out.push(S(G.disc(56, 60, 5, Fx(-24, 46), P), { tone: "mid" }));
  // crankcase
  out.push(S(k.extrude(U(72, 62), 65, 117, P, { convex: false }), { tone: "mid", crease: "lo" }));
  // ribs on the crankcase back wall, seen through the cut
  for (const x of [-40, 40]) out.push(L(k.pathOf([at([x, BACK + 10, 70]), at([x, BACK + 10, M.ZC - 34])]), { tone: "faint" }));
  // main bearing boss and the journal running into it
  out.push(S(G.disc(BACK + 10, BACK + 18, 36, Fy(0, M.ZC), P), { tone: "mid", crease: "lo" }));
  out.push(S(G.disc(BACK + 18, BACK + 22, 34, Fy(0, M.ZC), P), { tone: "lo" }));
  out.push(D(G.dotsOf(Fy(0, M.ZC), BACK + 18, 30, 6, P, { all: true, phase: 0.5 }), { size: 0.6, tone: "hi" }));
  out.push(S(G.disc(BACK + 22, -27, 25, Fy(0, M.ZC), P), { tone: "mid" }));
  return out.join("");
}

function block() {
  const out = [];
  out.push(S(k.extrude(bore(), 182, M.DECK - 182, P, { convex: false }), { tone: "mid", crease: "lo" }));
  // cylinder wall honing marks, on the back half of the bore
  const hone = [];
  for (let i = 1; i < 6; i++) {
    const a = Math.PI * (0.18 + i * 0.13);
    hone.push(k.pathOf([at([43 * Math.cos(a), -43 * Math.sin(a), 182]), at([43 * Math.cos(a), -43 * Math.sin(a), M.DECK])]));
  }
  out.push(`<g opacity=".55">${L(hone.join(""), { tone: "faint" })}</g>`);
  // water jacket and a head bolt in the cut face
  for (const s of [-1, 1]) {
    out.push(face([[s * 50, 192], [s * 62, 192], [s * 62, M.DECK - 6], [s * 50, M.DECK - 6]].map(([x, z]) => [x, z]), "eng-cavity eng-water"));
  }
  out.push(L(k.sideSeam({ x: -70, y: BACK, w: 140, d: -BACK, r: 0 }, 182, P, 1), { tone: "lo" }));
  // block top deck and gasket
  out.push(S(k.extrude(bore(), M.DECK, 2, P, { convex: false }), { tone: "lo", crease: "none" }));
  return out.join("");
}

const INTAKE_PORT = smoothLine([[-76, 376], [-56, 374], [-40, 366], [-29, 356]]);
const EXHAUST_PORT = smoothLine([[29, 356], [40, 366], [56, 374], [76, 376]]);

function head() {
  const out = [];
  const plan = { x: -74, y: BACK, w: 148, d: -BACK, r: 0 };
  out.push(S(k.slabOf(plan, M.HEAD, HEAD_TOP - M.HEAD, P, 1, 0.8), { tone: "mid", crease: "lo", inner: L(k.sideSeam(plan, HEAD_TOP - 12, P, 1), { tone: "faint" }) }));
  // cavities in the cut face
  const chamber = [[-43, M.HEAD], [-40, M.ROOF - 4], [-30, M.ROOF], [30, M.ROOF], [40, M.ROOF - 4], [43, M.HEAD]];
  out.push(face(chamber, "eng-cavity"));
  out.push(face(ribbon(INTAKE_PORT, (t) => 10 + t * 3), "eng-cavity eng-port"));
  out.push(face(ribbon(EXHAUST_PORT, (t) => 12 - t * 2), "eng-cavity eng-port"));
  for (const x of [XI, XE]) {
    out.push(face([[x - 14, V.SEAT_Z], [x + 14, V.SEAT_Z], [x + 14, V.RETAINER_Z], [x + 16, V.RETAINER_Z], [x + 16, HEAD_TOP], [x - 16, HEAD_TOP], [x - 16, V.RETAINER_Z], [x - 14, V.RETAINER_Z]], "eng-cavity"));
    // valve seat insert, cut
    out.push(face([[x - (x < 0 ? RI : RE) - 3, M.ROOF], [x - (x < 0 ? RI : RE) + 2, M.ROOF], [x - (x < 0 ? RI : RE) + 1, M.ROOF + 3], [x - (x < 0 ? RI : RE) - 3, M.ROOF + 3]], "eng-insert", "mid"));
    out.push(face([[x + (x < 0 ? RI : RE) - 2, M.ROOF], [x + (x < 0 ? RI : RE) + 3, M.ROOF], [x + (x < 0 ? RI : RE) + 3, M.ROOF + 3], [x + (x < 0 ? RI : RE) - 1, M.ROOF + 3]], "eng-insert", "mid"));
  }
  out.push(face([[-6, M.ROOF], [7, M.ROOF], [7, M.ROOF + 18], [9, M.ROOF + 18], [9, HEAD_TOP - 6], [-8, HEAD_TOP - 6], [-8, M.ROOF + 18], [-6, M.ROOF + 18]], "eng-cavity"));
  // head bolts on top and the cam carrier
  const bolts = [[-62, BACK + 9], [62, BACK + 9], [-62, -10], [62, -10]];
  for (const [x, y] of bolts) {
    out.push(S(k.cylinder(x, y, 5.5, HEAD_TOP, 4, P, 6), { tone: "mid" }));
    out.push(D([at([x, y, HEAD_TOP + 4])], { size: 0.6, tone: "hi" }));
  }
  return out.join("");
}

// The camshaft carrier: a tower under each shaft with a bolted cap.
function tower(x) {
  const plan = { x: x - 17, y: -38, w: 34, d: 14, r: 1 };
  const out = [S(k.slabOf(plan, HEAD_TOP, V.CAM_Z + 14 - HEAD_TOP, P, 2, 0.5), { tone: "mid", crease: "lo", inner: L(k.sideSeam(plan, V.CAM_Z, P, 2), { tone: "lo" }) })];
  out.push(D([x - 12, x + 12].map((bx) => at([bx, -31, V.CAM_Z + 14])), { size: 0.6, tone: "hi" }));
  return out.join("");
}

const shaft = (x, y0, y1) => S(G.disc(y0, y1, V.SHAFT_R, Fy(x, V.CAM_Z), P), { tone: "mid" });

// ---------- the intake (left, behind) and exhaust (right, in front) ----------
function intake() {
  const out = [];
  const y = 0;
  const z = 376;
  out.push(S(G.disc(-140, -78, 12, Fx(y, z), P), { tone: "mid" }));
  out.push(S(G.disc(-78, -74, 17, Fx(y, z), P), { tone: "mid", crease: "lo" }));
  out.push(D(G.dotsOf(Fx(y, z), -74, 14, 4, P, { all: true, phase: 0.125 }), { size: 0.6, tone: "hi" }));
  out.push(S(G.sphereOf([-146, y, z], 13, P), { tone: "mid" }));
  out.push(S(G.disc(z + 6, 452, 12, Fz(-146, y, 0), P), { tone: "mid" }));
  // throttle body with its spindle boss, then the air horn
  out.push(S(G.disc(452, 456, 17, Fz(-146, y, 0), P), { tone: "mid", crease: "lo" }));
  out.push(S(G.disc(456, 478, 15, Fz(-146, y, 0), P), { tone: "mid" }));
  out.push(S(G.disc(-131, -126, 5, Fx(y, 467), P), { tone: "mid" }));
  out.push(S(G.disc(478, 482, 17, Fz(-146, y, 0), P), { tone: "mid", crease: "lo" }));
  out.push(S(G.solidOf([[482, 15], [490, 17, 1], [496, 21, 1], [499, 25]], Fz(-146, y, 0), P, { fill: "hull" }), { tone: "mid" }));
  out.push(L(G.arcOf(Fz(-146, y, 0), 499, 22, P, { inward: true, least: -1 }), { tone: "lo" }));
  return out.join("");
}

function exhaust() {
  const out = [];
  const z = 376;
  out.push(S(G.disc(74, 79, 18, Fx(0, z), P), { tone: "mid", crease: "lo" }));
  out.push(D(G.dotsOf(Fx(0, z), 79, 14.5, 4, P, { all: true, phase: 0.125 }), { size: 0.6, tone: "hi" }));
  out.push(S(G.disc(79, 118, 13, Fx(0, z), P), { tone: "mid", inner: L(G.arcOf(Fx(0, z), 100, 13, P), { tone: "faint" }) }));
  out.push(S(G.sphereOf([126, 0, z], 14.5, P), { tone: "mid" }));
  out.push(S(G.disc(250, z - 8, 13, Fz(126, 0, 0), P), { tone: "mid" }));
  // oxygen sensor boss on the downpipe
  out.push(S(G.disc(13, 19, 5, G.frameOf([126, 0, 320], [0.6, 0.8, 0], [0, 0, 1], [0.8, -0.6, 0]), P), { tone: "mid" }));
  out.push(S(G.disc(19, 27, 3.6, G.frameOf([126, 0, 320], [0.6, 0.8, 0], [0, 0, 1], [0.8, -0.6, 0]), P), { tone: "hi" }));
  // a slip flange where the downpipe meets the rest of the system, bolted to a hanger post
  out.push(S(G.disc(244, 250, 18, Fz(126, 0, 0), P), { tone: "mid", crease: "lo" }));
  out.push(D(G.dotsOf(Fz(126, 0, 0), 250, 15, 3, P, { phase: 0.1 }), { size: 0.6, tone: "hi" }));
  out.push(S(G.disc(0, 244, 9, Fz(126, 0, 0), P), { tone: "mid" }));
  out.push(S(k.cylinder(126, 0, 18, 0, 5, P, 32, 0.5), { tone: "mid" }));
  return out.join("");
}

// ---------- the parts that move, at their rest pose (TDC, start of intake) ----------
function pistonSvg() {
  const top = M.crownZ(0);
  const out = [];
  const skirt = top - 58;
  out.push(S(k.cylinder(0, 0, 42.4, skirt, 58, P, 72, 0.9), { tone: "hi", crease: "lo", lit: true, inner: L([top - 6, top - 10, top - 14].map((z) => k.sideArc(0, 0, 42.4, z, P, 48)).join(""), { tone: "lo" }) + L(k.sideArc(0, 0, 42.4, top - 30, P, 48), { tone: "faint" }) }));
  // valve reliefs and the arrow on the crown
  out.push(L(k.ring(XI, 0, RI + 2, top, P, 40) + k.ring(XE, 0, RE + 2, top, P, 40), { tone: "faint" }));
  out.push(D([at([0, 26, top])], { size: 0.7, tone: "mid" }));
  // the gudgeon pin's end, seen through the piston's side
  out.push(L(k.sideRing([0, 42.4, top - M.PIN_TO_CROWN], 10, "y", P, 28), { tone: "lo" }));
  out.push(L(k.sideRing([0, 42.4, top - M.PIN_TO_CROWN], 6, "y", P, 24), { tone: "faint" }));
  return out.join("");
}

function valveSvg(x, r) {
  const F = Fz(x, 0, M.ROOF);
  const stemTop = V.RETAINER_Z + 6 - M.ROOF;
  const out = [];
  out.push(S(G.disc(9, stemTop, 3.6, F, P), { tone: "hi", lit: true, inner: L(G.arcOf(F, stemTop - 9, 3.6, P), { tone: "lo" }) }));
  out.push(S(G.solidOf([[0, r], [1.8, r], [3.2, r - 3, 1], [6, 6.5, 1], [9, 3.6]], F, P, { fill: "surface" }), { tone: "hi", lit: true }));
  return out.join("");
}

function capSvg(x) {
  const out = [];
  out.push(S(k.cylinder(x, 0, 12.5, V.RETAINER_Z, 3, P, 40), { tone: "mid" }));
  out.push(S(k.cylinder(x, 0, 15, V.RETAINER_Z + 3, HEAD_TOP - V.RETAINER_Z - 3, P, 48, 0.6), { tone: "hi", crease: "lo", inner: L(k.sideArc(x, 0, 15, HEAD_TOP - 6, P, 32), { tone: "faint" }) }));
  out.push(L(k.ring(x, 0, 10, HEAD_TOP, P, 32), { tone: "faint" }));
  return out.join("");
}

function plugSvg() {
  const x = 0.5;
  const out = [];
  const F = Fz(x, 0, M.ROOF);
  out.push(S(G.disc(-2, 0, 1, F, P), { tone: "hi" }));
  out.push(S(G.disc(0, 18, 6, F, P), { tone: "mid", inner: L([4, 8, 12].map((s) => G.arcOf(F, s, 6, P)).join(""), { tone: "lo" }) }));
  out.push(S(k.cylinder(x, 0, 8, M.ROOF + 18, 9, P, 6), { tone: "mid" }));
  out.push(S(G.solidOf([[27, 5.4], [30, 5.4], [33, 4.6, 1], [52, 4.4]], F, P), { tone: "hi", inner: L([38, 42, 46].map((s) => G.arcOf(F, s, 4.5, P)).join(""), { tone: "faint" }) }));
  out.push(S(G.disc(52, 76, 7, F, P), { tone: "lo", crease: "none" }));
  out.push(S(G.disc(76, HEAD_TOP - M.ROOF - 6, 5.5, F, P), { tone: "lo" }));
  return out.join("");
}

// ---------- assemble ----------
const DEG0 = 0;
const lift0 = (valve) => M.liftOf(valve, DEG0);
const move = (dz) => k.translateAlong(P, [0, 0, dz]);
const wire = (from, to) => k.wireSvg(at(from), at(to), { tone: "lo" });

const body = [
  bench(),
  label(),
  `<g data-part="drive">${parts.drive(DEG0)}</g>`,
  L(beltPath(), { tone: "mid" }),
  intake(),
  shaft(XI, V.BELT_Y + 4, -38),
  shaft(XE, V.BELT_Y + 4, -38),
  lower(),
  block(),
  head(),
  tower(XI),
  tower(XE),
  `<path data-part="gas" class="eng-gas" d=""/>`,
  `<path data-part="flame" class="eng-flame" d=""/>`,
  L(onY(INTAKE_PORT, 0), { tone: "lit", flow: true, className: "eng-flow", free: true }).replace("<path", '<path data-part="in-flow"'),
  L(onY(EXHAUST_PORT, 0), { tone: "lit", flow: true, className: "eng-flow", free: true }).replace("<path", '<path data-part="out-flow"'),
  `<g data-part="crank">${parts.crank(DEG0)}</g>`,
  S(G.disc(27, 33, 24, Fy(0, M.ZC), P), { tone: "mid", inner: "" }) + D([at([0, 33, M.ZC])], { size: 0.8, tone: "hi" }),
  `<g data-part="piston" transform="${move(0)}">${pistonSvg()}</g>`,
  `<g data-part="spring-back-i">${parts.spring(XI, lift0(M.INTAKE), 0)}</g>`,
  `<g data-part="valve-i" transform="${move(-lift0(M.INTAKE))}">${valveSvg(XI, RI)}</g>`,
  `<g data-part="spring-front-i">${parts.spring(XI, lift0(M.INTAKE), 1)}</g>`,
  `<g data-part="cap-i" transform="${move(-lift0(M.INTAKE))}">${capSvg(XI)}</g>`,
  plugSvg(),
  `<circle data-part="spark" class="eng-spark" cx="${at([0.5, 0, M.ROOF - 2])[0]}" cy="${at([0.5, 0, M.ROOF - 2])[1]}" r="0"/>`,
  `<g data-part="spring-back-e">${parts.spring(XE, lift0(M.EXHAUST), 0)}</g>`,
  `<g data-part="valve-e" transform="${move(-lift0(M.EXHAUST))}">${valveSvg(XE, RE)}</g>`,
  `<g data-part="spring-front-e">${parts.spring(XE, lift0(M.EXHAUST), 1)}</g>`,
  `<g data-part="cap-e" transform="${move(-lift0(M.EXHAUST))}">${capSvg(XE)}</g>`,
  shaft(XI, -24, -9),
  `<g data-part="lobe-i">${parts.lobe(M.INTAKE, XI, DEG0)}</g>`,
  shaft(XI, 9, 14) + S(G.disc(14, 16, 8, Fy(XI, V.CAM_Z), P), { tone: "mid" }),
  shaft(XE, -24, -9),
  `<g data-part="lobe-e">${parts.lobe(M.EXHAUST, XE, DEG0)}</g>`,
  shaft(XE, 9, 14) + S(G.disc(14, 16, 8, Fy(XE, V.CAM_Z), P), { tone: "mid" }),
  exhaust(),
];

function beltPath() {
  const wheels = [
    [0, M.ZC, V.CRANK_TEETH_R + 1.5],
    [XI, V.CAM_Z, V.CAM_TEETH_R + 1.5],
    [XE, V.CAM_Z, V.CAM_TEETH_R + 1.5],
  ];
  const points = wheels.flatMap(([x, z, r]) => circle(x, z, r, 64));
  const hull = G.hullOf(points);
  return onY(hull, V.BELT_Y, true) + onY(G.hullOf(wheels.flatMap(([x, z, r]) => circle(x, z, r + 3, 64))), V.BELT_Y, true);
}

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "One cylinder of a four-stroke petrol engine on a bench, cut open down the middle. A crankshaft at the bottom turns a connecting rod that drives a piston up and down the bore. In the head, two camshafts driven by a toothed belt at half crank speed press an intake valve and an exhaust valve open against their springs, and a spark plug sits between them. The figure runs through intake, compression, power and exhaust, and the readout gives the stroke, the crank angle and the cylinder pressure.",
  body,
});

const CSS = `
.eng-cavity{fill:var(--eng-cavity)}
.eng-insert{fill:var(--anatomy-shade-2)}
.eng-gas{fill:var(--eng-gas);transition:none}
.eng-flame{fill:var(--eng-flame)}
.eng-spark{fill:var(--anatomy-lit)}
.eng-coil{stroke-width:.9px;fill:none}
.eng-flow{stroke-width:1.4px}
.eng-lamp{fill:var(--anatomy-lit);opacity:0;transition:opacity .25s}
.eng-lamp[data-on]{opacity:1}
.iso{--eng-cavity:#e4e4e1;--eng-gas:#7a7a7a;--eng-flame:#e8590c}
.iso[data-theme="dark"]{--eng-cavity:#0c0c0c;--eng-gas:#ffffff;--eng-flame:#ff8a3d}
`;

const strip = (text) => text.replace(/^import .*$/gm, "").replace(/^export /gm, "");
const live = `
const G = (() => { ${strip(readFileSync(join(HERE, "kit/lathe.mjs"), "utf8"))}; return { frameOf, prismOf, hullOf, disc, lathe, dotsOf }; })();
const M = (() => { ${strip(readFileSync(join(HERE, "model.mjs"), "utf8"))}; return { ZC, PIN_TO_CROWN, ROOF, INTAKE, EXHAUST, SPARK, BORE, pinZ, crownZ, crankPin, liftOf, pressure, burnt, strokeOf, STROKES, volume }; })();
${strip(readFileSync(join(HERE, "parts.mjs"), "utf8"))}
const P = ${JSON.stringify(P)};
const V = ${JSON.stringify(V)};
const K = { iso, pathOf, solidSvg, lineSvg, dotsSvg, towardViewer };
const parts = makeParts(K, G, M, P, V);
${readFileSync(join(HERE, "live.js"), "utf8")}
`;

const body2 = k.plateHtml({
  fig: "Fig 1",
  title: "Four-stroke engine",
  hint: "Drag or use ← → to turn the crank",
  readout: "Intake · 0° · 0.9 bar",
  keys: [
    { mark: "lit", label: "Piston, rod and valves: the parts that move the gas" },
    { mark: "raised", label: "Crankshaft and camshafts, tied by a 2:1 toothed belt" },
    { mark: "dim", label: "Gas in the cylinder, darker as the pressure rises" },
  ],
  caption:
    "One cylinder, 86 mm bore and 86 mm stroke (500 cc), compression 10:1, cut open down the middle. Two turns of the crank make one cycle: intake draws air and fuel in, compression squeezes it to a tenth, the spark at 15° before top centre burns it and the pressure drives the piston down, and exhaust pushes the burnt gas out. The camshafts turn once per cycle, so each valve opens once every two turns.",
  body: `<div class="iso-stage eng-stage" tabindex="0" role="slider" aria-label="Crank angle: arrow keys turn the crank 10 degrees" aria-valuemin="0" aria-valuemax="720" aria-valuenow="0">${svg}</div>`,
});

const html = k.pageHtml({ title: "Four-stroke engine", theme, body: `<style>${CSS}</style>${body2}`, script: strip(readFileSync(join(HERE, "kit/iso-kit.mjs"), "utf8")) + live });
const name = theme === "light" ? "car-engine-light.html" : "car-engine.html";
writeFileSync(join(HERE, name), html);
console.log("wrote", name, Math.round(html.length / 1024) + " KB");
