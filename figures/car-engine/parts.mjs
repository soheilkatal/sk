// The parts that move. Used by the build for the first frame and inlined into the page,
// which redraws them every frame from the same functions.
// k is the iso kit, G the lathe kit, M the engine model, P the projection.

export function makeParts(k, G, M, P, V) {
  const TAU = Math.PI * 2;
  const rad = (deg) => (deg * Math.PI) / 180;
  const at = (point) => k.iso(point, P);
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const onY = (points, y, closed = false) => k.pathOf(points.map(([x, z]) => at([x, y, z])), closed);
  const circle = (cx, cz, r, n = 28) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * TAU), cz + r * Math.sin((i / n) * TAU)]);
  const FY = G.frameOf([0, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  const prismY = (polygon, y0, y1) => G.prismOf(FY, G.hullOf(polygon), y0, y1, P);
  const Fy = (x, z) => G.frameOf([x, 0, z], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  const view = k.towardViewer(P);

  // A point on a wheel whose features turn with the crank: beta is measured from straight down toward +x.
  const wheel = (cx, cz, r, beta) => [cx + r * Math.sin(rad(beta)), cz - r * Math.cos(rad(beta))];

  function web(deg, y0, y1) {
    const [px, pz] = M.crankPin(deg);
    const points = [...circle(px, pz, 22, 24), ...circle(0, M.ZC, 27, 24)];
    for (let i = 0; i <= 16; i++) {
      const phi = rad(deg + 180 - 68 + (136 * i) / 16);
      points.push([56 * Math.sin(phi), M.ZC + 56 * Math.cos(phi)]);
    }
    const face = y1 > 0 ? y1 : y1;
    const lines =
      L(onY(circle(0, M.ZC, 20, 40), face, true), { tone: "lo" }) +
      L(onY(circle(px, pz, 15, 32), face, true), { tone: "lo" }) +
      k.dotsSvg([at([0, face, M.ZC]), at([px, face, pz])], { size: 0.7, tone: "mid" });
    return S(prismY(points, y0, y1), { tone: "hi", crease: "lo", inner: lines });
  }

  function rod(deg) {
    const [px, pz] = M.crankPin(deg);
    const sz = M.pinZ(deg);
    const paths = prismY([...circle(px, pz, 25, 32), ...circle(0, sz, 13, 24)], -10, 10);
    const len = Math.hypot(-px, sz - pz);
    const d = [-px / len, (sz - pz) / len];
    const n = [d[1], -d[0]];
    const p = (along, side, ox = px, oz = pz) => [ox + d[0] * along + n[0] * side, oz + d[1] * along + n[1] * side];
    const beam = [p(30, -8), p(len - 18, -4.5), p(len - 18, 4.5), p(30, 8)];
    const inner =
      L(onY(beam, 10, true), { tone: "lo" }) +
      L(onY(circle(px, pz, 17, 36), 10, true), { tone: "mid" }) +
      L(onY(circle(0, sz, 8, 24), 10, true), { tone: "lo" }) +
      L(onY([p(-1.5, -25), p(-1.5, 25)], 10), { tone: "lo" }) +
      k.dotsSvg([p(-8, -20), p(-8, 20)].map(([x, z]) => at([x, 10, z])), { size: 0.8, tone: "hi" });
    return S(paths, { tone: "hi", crease: "lo", inner, lit: true });
  }

  function crank(deg) {
    const [px, pz] = M.crankPin(deg);
    const pin = G.disc(-14, 14, 16, Fy(px, pz), P);
    return [web(deg, -27, -15), S(pin, { tone: "mid" }), rod(deg), web(deg, 15, 27)].join("");
  }

  function lobe(valve, x, deg) {
    const alpha = deg / 2;
    const points = [];
    for (let beta = 0; beta < 360; beta += 3) {
      const r = V.CAM_R + M.liftOf(valve, 2 * (alpha + beta));
      points.push(wheel(x, V.CAM_Z, r, beta));
    }
    const mark = wheel(x, V.CAM_Z, 6, -alpha);
    const inner = L(onY(circle(x, V.CAM_Z, V.SHAFT_R, 32), 9, true), { tone: "faint" }) + k.dotsSvg([at([mark[0], 9, mark[1]])], { size: 0.7, tone: "mid" });
    return S(prismY(points, -9, 9), { tone: "hi", crease: "lo", inner });
  }

  function sprocket(x, z, r, teeth, turn, y0, y1, mark) {
    const points = [];
    for (let i = 0; i < teeth * 2; i++) points.push(wheel(x, z, i % 2 ? r - 2.2 : r, (i * 180) / teeth - turn));
    const dot = wheel(x, z, r - 6, -turn);
    const inner = L(onY(circle(x, z, r * 0.62, 40), y1, true), { tone: "faint" }) + L(onY(circle(x, z, 5, 20), y1, true), { tone: "lo" }) + (mark ? k.dotsSvg([at([dot[0], y1, dot[1]])], { size: 0.9, tone: "hi" }) : "");
    return S(G.prismOf(FY, points, y0, y1, P), { tone: "mid", crease: "lo", inner });
  }

  function drive(deg) {
    return [
      sprocket(0, M.ZC, V.CRANK_TEETH_R, 12, deg, V.BELT_Y - 4, V.BELT_Y + 4, true),
      sprocket(V.XI, V.CAM_Z, V.CAM_TEETH_R, 24, deg / 2, V.BELT_Y - 4, V.BELT_Y + 4, true),
      sprocket(V.XE, V.CAM_Z, V.CAM_TEETH_R, 24, deg / 2, V.BELT_Y - 4, V.BELT_Y + 4, true),
    ].join("");
  }

  // A coil spring round a valve stem, compressed by the lift; half 0 is the back, half 1 the front.
  function spring(x, lift, half) {
    const z0 = V.SEAT_Z;
    const z1 = V.RETAINER_Z - lift;
    const turns = 6.5;
    const steps = Math.round(turns * 24);
    const runs = [];
    let run = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * turns * TAU;
      const front = Math.cos(t) * view[0] + Math.sin(t) * view[1] > 0;
      const point = at([x + V.SPRING_R * Math.cos(t), V.SPRING_R * Math.sin(t), z0 + 1 + ((z1 - z0 - 2) * i) / steps]);
      if (front === Boolean(half)) run.push(point);
      else if (run.length) {
        run.push(point);
        runs.push(run);
        run = [];
      }
    }
    if (run.length > 1) runs.push(run);
    const d = runs.map((points) => k.pathOf(points)).join("");
    return `<path class="iso-line eng-coil" data-tone="${half ? "hi" : "mid"}" d="${d}"/>`;
  }

  return { crank, lobe, drive, spring, circle, onY };
}
