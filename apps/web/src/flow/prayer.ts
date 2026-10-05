// Dubai prayer times: adhan's Meeus port, UAE method, standard Asr, matched to Khaleej Times.

export type Prayer = { name: string; at: number };

const LAT = 25.2048;
const LNG = 55.2708;
const ANGLE = 18.2;
const GST_MS = 4 * 3600_000;
const DAY_MS = 86400_000;
// UAE method adjustments plus our Khaleej Times offsets (asr -2, sunrise -1), in minutes.
const SHIFT = { fajr: 0, sunrise: -4, dhuhr: 3, asr: 1, maghrib: 3, isha: 0 };

// The next prayer after `now`, sunrise excluded.
export function nextPrayer(now: number): Prayer {
  const day = dubaiDay(now);
  const coming = [...prayersOn(day), ...prayersOn(day + DAY_MS)].filter(
    (p) => p.name !== "Sunrise" && p.at > now,
  );
  return coming[0]!;
}

// Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha for the Dubai date starting at `day` (UTC ms of that date's midnight).
export function prayersOn(day: number): Prayer[] {
  const sun = solarDay(day);
  const at = (hours: number, shift: number) =>
    roundMinute(day + Math.floor(hours * 3600) * 1000 + shift * 60_000);
  return [
    { name: "Fajr", at: at(sun.hourAngle(-ANGLE, false), SHIFT.fajr) },
    { name: "Sunrise", at: at(sun.hourAngle(-50 / 60, false), SHIFT.sunrise) },
    { name: "Dhuhr", at: at(sun.transit, SHIFT.dhuhr) },
    { name: "Asr", at: at(sun.asr(), SHIFT.asr) },
    { name: "Maghrib", at: at(sun.hourAngle(-50 / 60, true), SHIFT.maghrib) },
    { name: "Isha", at: at(sun.hourAngle(-ANGLE, true), SHIFT.isha) },
  ];
}

// "15:32" in GST.
export function gstClock(ms: number): string {
  const d = new Date(ms + GST_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// UTC midnight of the calendar date it is in Dubai at `ms`.
export function dubaiDay(ms: number): number {
  return Math.floor((ms + GST_MS) / DAY_MS) * DAY_MS;
}

const pad = (n: number) => String(n).padStart(2, "0");

function roundMinute(ms: number): number {
  return Math.floor(ms / 60_000) * 60_000 + (Math.floor(ms / 1000) % 60 >= 30 ? 60_000 : 0);
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const unwind = (a: number) => a - 360 * Math.floor(a / 360);
const closest = (a: number) => (a >= -180 && a <= 180 ? a : a - 360 * Math.round(a / 360));

function solarDay(day: number) {
  const jd = day / DAY_MS + 2440587.5;
  const prev = solarCoordinates(jd - 1);
  const cur = solarCoordinates(jd);
  const next = solarCoordinates(jd + 1);
  const approx = (cur.ra - LNG - cur.sidereal) / 360;
  const m0 = approx - Math.floor(approx);

  const interpolate = (y2: number, y1: number, y3: number, n: number) => {
    const a = y2 - y1;
    const b = y3 - y2;
    return y2 + (n / 2) * (a + b + n * (b - a));
  };
  const interpolateAngles = (y2: number, y1: number, y3: number, n: number) => {
    const a = unwind(y2 - y1);
    const b = unwind(y3 - y2);
    return y2 + (n / 2) * (a + b + n * (b - a));
  };
  const ra = (m: number) => unwind(interpolateAngles(cur.ra, prev.ra, next.ra, m));
  const theta = (m: number) => unwind(cur.sidereal + 360.985647 * m);

  const transitM = m0 - closest(theta(m0) + LNG - ra(m0)) / 360;

  const hourAngle = (h0: number, afterTransit: boolean): number => {
    const cosH =
      (Math.sin(rad(h0)) - Math.sin(rad(LAT)) * Math.sin(rad(cur.dec))) /
      (Math.cos(rad(LAT)) * Math.cos(rad(cur.dec)));
    const H0 = deg(Math.acos(cosH));
    const m = afterTransit ? m0 + H0 / 360 : m0 - H0 / 360;
    const dec = interpolate(cur.dec, prev.dec, next.dec, m);
    const H = theta(m) + LNG - ra(m);
    const h = deg(
      Math.asin(
        Math.sin(rad(LAT)) * Math.sin(rad(dec)) +
          Math.cos(rad(LAT)) * Math.cos(rad(dec)) * Math.cos(rad(H)),
      ),
    );
    return (m + (h - h0) / (360 * Math.cos(rad(dec)) * Math.cos(rad(LAT)) * Math.sin(rad(H)))) * 24;
  };

  return {
    transit: transitM * 24,
    hourAngle,
    // Standard (Shafi) Asr: shadow equals object length.
    asr: () => hourAngle(deg(Math.atan(1 / (1 + Math.tan(rad(Math.abs(LAT - cur.dec)))))), true),
  };
}

function solarCoordinates(jd: number) {
  const T = (jd - 2451545) / 36525;
  const L0 = unwind(280.4664567 + 36000.76983 * T + 0.0003032 * T * T);
  const Lp = unwind(218.3165 + 481267.8813 * T);
  const omega = unwind(125.04452 - 1934.136261 * T + 0.0020708 * T * T + T ** 3 / 450000);
  const M = rad(unwind(357.52911 + 35999.05029 * T - 0.0001537 * T * T));
  const centre =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  const O = 125.04 - 1934.136 * T;
  const lambda = rad(unwind(L0 + centre - 0.00569 - 0.00478 * Math.sin(rad(O))));
  const theta0 = unwind(
    280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T - T ** 3 / 38710000,
  );
  const dPsi =
    (-17.2 / 3600) * Math.sin(rad(omega)) -
    (1.32 / 3600) * Math.sin(2 * rad(L0)) -
    (0.23 / 3600) * Math.sin(2 * rad(Lp)) +
    (0.21 / 3600) * Math.sin(2 * rad(omega));
  const dEps =
    (9.2 / 3600) * Math.cos(rad(omega)) +
    (0.57 / 3600) * Math.cos(2 * rad(L0)) +
    (0.1 / 3600) * Math.cos(2 * rad(Lp)) -
    (0.09 / 3600) * Math.cos(2 * rad(omega));
  const eps0 = 23.439291 - 0.013004167 * T - 0.0000001639 * T * T + 0.0000005036 * T ** 3;
  const eps = rad(eps0 + 0.00256 * Math.cos(rad(O)));
  return {
    dec: deg(Math.asin(Math.sin(eps) * Math.sin(lambda))),
    ra: unwind(deg(Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)))),
    sidereal: theta0 + (dPsi * 3600 * Math.cos(rad(eps0 + dEps))) / 3600,
  };
}
