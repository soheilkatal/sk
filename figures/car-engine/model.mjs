// One cylinder of a four-stroke petrol engine, in millimetres.
// Every number the figure draws or prints comes from here.

export const BORE = 86;
export const STROKE = 86;
export const CRANK = STROKE / 2;
export const ROD = 143;
export const RATIO = 10;
export const PIN_TO_CROWN = 30;

export const ZC = 120;
export const DECK = ZC + CRANK + ROD + PIN_TO_CROWN + 1;
export const HEAD = DECK + 2;
export const ROOF = HEAD + 10;

export const SWEPT = (Math.PI / 4) * BORE * BORE * STROKE;
export const CLEAR = SWEPT / (RATIO - 1);

// Valve events in crank degrees of the 720° cycle; 0° is top dead centre at the start of intake.
export const INTAKE = { open: -12, close: 228, lift: 9.5 };
export const EXHAUST = { open: 492, close: 732, lift: 9 };
export const SPARK = 345;

const rad = (deg) => (deg * Math.PI) / 180;
const wrap = (deg) => ((deg % 720) + 720) % 720;

export function pinZ(deg) {
  const t = rad(deg);
  return ZC + CRANK * Math.cos(t) + Math.sqrt(ROD * ROD - (CRANK * Math.sin(t)) ** 2);
}

export const crownZ = (deg) => pinZ(deg) + PIN_TO_CROWN;

export function crankPin(deg) {
  const t = rad(deg);
  return [CRANK * Math.sin(t), ZC + CRANK * Math.cos(t)];
}

export function liftOf(valve, deg) {
  const span = valve.close - valve.open;
  const t = wrap(deg - valve.open) / span;
  return t > 0 && t < 1 ? valve.lift * Math.sin(Math.PI * t) ** 2 : 0;
}

export function volume(deg) {
  const fall = crownZ(0) - crownZ(deg);
  return CLEAR + (Math.PI / 4) * BORE * BORE * fall;
}

const N = 1.32;
const P_IN = 0.92;
const P_OUT = 1.08;
const RISE = 2.7;

// Fraction of the charge burnt (a Wiebe curve from the spark to 55° later).
export function burnt(deg) {
  const d = wrap(deg);
  if (d < SPARK) return 0;
  const x = Math.min(1, (d - SPARK) / 55);
  return 1 - Math.exp(-5 * x ** 3);
}

// Cylinder pressure in bar, absolute.
export function pressure(deg) {
  const d = wrap(deg);
  const v = volume(d);
  const vClose = volume(INTAKE.close);
  if (d < INTAKE.close) return P_IN;
  if (d < EXHAUST.open) return P_IN * (vClose / v) ** N * (1 + RISE * burnt(d));
  const atOpen = P_IN * (vClose / volume(EXHAUST.open)) ** N * (1 + RISE);
  if (d < 708) return P_OUT + (atOpen - P_OUT) * Math.exp(-(d - EXHAUST.open) / 11);
  return P_OUT + (P_IN - P_OUT) * ((d - 708) / 12);
}

export const STROKES = ["Intake", "Compression", "Power", "Exhaust"];
export const strokeOf = (deg) => Math.floor(wrap(deg) / 180);
