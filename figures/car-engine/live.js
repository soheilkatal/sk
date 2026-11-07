const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const $ = (name) => svg.querySelector(`[data-part="${name}"]`);
const el = {
  crank: $("crank"), piston: $("piston"), drive: $("drive"), gas: $("gas"), flame: $("flame"), spark: $("spark"),
  inFlow: $("in-flow"), outFlow: $("out-flow"),
  valveI: $("valve-i"), capI: $("cap-i"), backI: $("spring-back-i"), frontI: $("spring-front-i"), lobeI: $("lobe-i"),
  valveE: $("valve-e"), capE: $("cap-e"), backE: $("spring-back-e"), frontE: $("spring-front-e"), lobeE: $("lobe-e"),
};
const lamps = [...svg.querySelectorAll("[data-lamp]")];
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap = (d) => ((d % 720) + 720) % 720;
const move = (dz) => translateAlong(P, [0, 0, dz]);
const CHAMBER = [[43, M.ROOF - 10], [40, M.ROOF - 4], [30, M.ROOF], [-30, M.ROOF], [-40, M.ROOF - 4], [-43, M.ROOF - 10]];
const SPARK_AT = iso([0.5, 0, M.ROOF - 2], P);

let shown = -1;
function draw(deg) {
  const d = wrap(deg);
  if (Math.abs(d - shown) < 0.05) return;
  shown = d;
  const li = M.liftOf(M.INTAKE, d);
  const le = M.liftOf(M.EXHAUST, d);
  const crown = M.crownZ(d);
  el.crank.innerHTML = parts.crank(d);
  el.piston.setAttribute("transform", move(crown - M.crownZ(0)));
  el.drive.innerHTML = parts.drive(d);
  el.lobeI.innerHTML = parts.lobe(M.INTAKE, V.XI, d);
  el.lobeE.innerHTML = parts.lobe(M.EXHAUST, V.XE, d);
  el.valveI.setAttribute("transform", move(-li));
  el.capI.setAttribute("transform", move(-li));
  el.valveE.setAttribute("transform", move(-le));
  el.capE.setAttribute("transform", move(-le));
  el.backI.innerHTML = parts.spring(V.XI, li, 0);
  el.frontI.innerHTML = parts.spring(V.XI, li, 1);
  el.backE.innerHTML = parts.spring(V.XE, le, 0);
  el.frontE.innerHTML = parts.spring(V.XE, le, 1);

  const p = M.pressure(d);
  const wall = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI;
    wall.push(iso([43 * Math.cos(a), -43 * Math.sin(a), crown], P));
  }
  const gas = pathOf([...wall, ...CHAMBER.map(([x, z]) => iso([-x, 0, z], P))], true);
  el.gas.setAttribute("d", gas);
  el.gas.style.opacity = (0.06 + 0.42 * clamp(Math.log(p / 0.9) / Math.log(60), 0, 1)).toFixed(3);
  const burnt = M.burnt(d);
  const glow = d < M.SPARK ? 0 : burnt * Math.exp(-Math.max(0, d - M.SPARK - 40) / 70);
  el.flame.setAttribute("d", gas);
  el.flame.style.opacity = (0.85 * glow).toFixed(3);
  const spark = d >= M.SPARK && d < M.SPARK + 14 ? Math.sin((Math.PI * (d - M.SPARK)) / 14) : 0;
  el.spark.setAttribute("r", (3.2 * spark).toFixed(2));
  el.inFlow.style.opacity = (li / M.INTAKE.lift).toFixed(3);
  el.outFlow.style.opacity = (le / M.EXHAUST.lift).toFixed(3);

  const s = M.strokeOf(d);
  lamps.forEach((lamp, i) => lamp.toggleAttribute("data-on", i === s));
  const text = `${M.STROKES[s]} · ${Math.round(d)}° · ${p < 10 ? p.toFixed(1) : Math.round(p)} bar`;
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(d)));
  stage.setAttribute("aria-valuetext", text);
}

// Motion: an idle tour turns the crank at a steady 110°/s; dragging or the arrow keys take over.
let deg = still.matches ? 375 : 0;
let target = deg;
let touring = !still.matches;
let frame = 0, last = 0, visible = false, idle = 0;
const SPEED = 110;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  if (touring) {
    deg += SPEED * dt;
    target = deg;
  } else {
    deg = still.matches ? target : deg + (target - deg) * (1 - Math.exp(-dt / 0.12));
    if (Math.abs(target - deg) < 0.05) deg = target;
  }
  draw(deg);
window.engineAt = (d) => { touring = false; clearTimeout(idle); target = deg = d; draw(d); };
  frame = visible && (touring || deg !== target) ? requestAnimationFrame(tick) : 0;
}
const run = () => {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};
const steer = (next) => {
  touring = false;
  target = next;
  clearTimeout(idle);
  idle = setTimeout(() => {
    touring = !still.matches;
    run();
  }, 4000);
  run();
};
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

let drag = null;
stage.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, from: target };
  stage.setPointerCapture(event.pointerId);
  steer(deg);
  drag.from = deg;
});
stage.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const box = svg.getBoundingClientRect();
  steer(drag.from + ((event.clientX - drag.x) / box.width) * 720);
});
const end = () => (drag = null);
stage.addEventListener("pointerup", end);
stage.addEventListener("pointercancel", end);
stage.addEventListener("keydown", (event) => {
  const step = { ArrowRight: 10, ArrowUp: 10, ArrowLeft: -10, ArrowDown: -10, PageUp: 90, PageDown: -90 }[event.key];
  if (event.key === "Home") return event.preventDefault(), steer(Math.floor(target / 720) * 720);
  if (event.key === " ") {
    event.preventDefault();
    touring = !touring && !still.matches;
    if (!touring) steer(deg);
    else run();
    return;
  }
  if (step === undefined) return;
  event.preventDefault();
  steer(target + step);
});
stage.style.touchAction = "pan-y";
draw(deg);
window.engineAt = (d) => { touring = false; clearTimeout(idle); target = deg = d; shown = -1; draw(d); };
