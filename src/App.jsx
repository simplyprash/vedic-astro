import { useState, useEffect, useRef, useCallback } from "react";
import * as Astronomy from 'astronomy-engine';

// ─── Astronomy ────────────────────────────────────────────────────────────────

function julianDay(date) {
  const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1;
  const d = date.getUTCDate() + (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) / 24;
  let Y = y, M = m;
  if (M <= 2) { Y -= 1; M += 12; }
  const A = Math.floor(Y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + d + B - 1524.5;
}

function norm360(x) { return ((x % 360) + 360) % 360; }

// ── Lahiri ayanamsa ──────────────────────────────────────────────────────────
function lahiriAyanamsa(jd) {
  const T = (jd - 2451545.0) / 36525;
  return 23.7614 + 1.3970 * T;
}

// ── Planetary positions using astronomy-engine (NASA JPL accuracy) ───────────
function computePlanetaryPositions(date) {
  const jd  = date.getTime() / 86400000 + 2440587.5;
  const aya = lahiriAyanamsa(jd);

  const bodies = {
    Sun:     Astronomy.Body.Sun,
    Moon:    Astronomy.Body.Moon,
    Mercury: Astronomy.Body.Mercury,
    Venus:   Astronomy.Body.Venus,
    Mars:    Astronomy.Body.Mars,
    Jupiter: Astronomy.Body.Jupiter,
    Saturn:  Astronomy.Body.Saturn,
  };

  const sid = {};
  for (const [name, body] of Object.entries(bodies)) {
    const vec = Astronomy.GeoVector(body, date, true);
    const ecl = Astronomy.Ecliptic(vec);
    sid[name] = norm360(ecl.elon - aya);
  }

  // Mean lunar node (Rahu) — standard Vedic mean node
  const T    = (jd - 2451545.0) / 36525;
  const rahu = norm360(125.04452 - 1934.13626 * T + 0.002071 * T * T);
  sid.Rahu   = norm360(rahu - aya);
  sid.Ketu   = norm360(sid.Rahu + 180);

  return sid;
}

function computeRetrogrades(date) {
  const yesterday = new Date(date.getTime() - 86400000);
  const pos0 = computePlanetaryPositions(yesterday);
  const pos1 = computePlanetaryPositions(date);
  const retro = new Set();
  for (const p of ["Mercury","Venus","Mars","Jupiter","Saturn"]) {
    let diff = pos1[p] - pos0[p];
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (diff < 0) retro.add(p);
  }
  retro.add("Rahu"); retro.add("Ketu");
  return retro;
}

// Fixed toNavamsa: returns actual sidereal longitude within the navamsa sign,
// preserving the fractional position within each 3°20' segment.
function toNavamsa(sidLong) {
  const rasi      = Math.floor(sidLong / 30);           // 0–11 rasi
  const posInRasi = sidLong % 30;                       // 0–30° within rasi
  const segSize   = 30 / 9;                             // 3.3333°
  const navPart   = Math.floor(posInRasi / segSize);    // 0–8 which navamsa segment
  const posInSeg  = posInRasi % segSize;                // position within segment
  // Navamsa start sign depends on rasi element
  const starts   = [0, 9, 6, 3]; // fire→Aries, earth→Cap, air→Lib, water→Can
  const elements = [0,1,2,3,0,1,2,3,0,1,2,3];
  const navSign  = (starts[elements[rasi]] + navPart) % 12;
  // Scale posInSeg (0–3.333°) to full sign width (0–30°)
  const posInNavSign = (posInSeg / segSize) * 30;
  return norm360(navSign * 30 + posInNavSign);
}

// ─── Static Data ──────────────────────────────────────────────────────────────

const FONT = "'Inter', 'Segoe UI', system-ui, sans-serif";

const ZODIAC_SIGNS = [
  { name: "Aries",       abbr: "Ar", symbol: "♈", element: "fire",  hue: "#C0392B" },
  { name: "Taurus",      abbr: "Ta", symbol: "♉", element: "earth", hue: "#27AE60" },
  { name: "Gemini",      abbr: "Ge", symbol: "♊", element: "air",   hue: "#C49A00" },
  { name: "Cancer",      abbr: "Ca", symbol: "♋", element: "water", hue: "#2980B9" },
  { name: "Leo",         abbr: "Le", symbol: "♌", element: "fire",  hue: "#C0392B" },
  { name: "Virgo",       abbr: "Vi", symbol: "♍", element: "earth", hue: "#27AE60" },
  { name: "Libra",       abbr: "Li", symbol: "♎", element: "air",   hue: "#C49A00" },
  { name: "Scorpio",     abbr: "Sc", symbol: "♏", element: "water", hue: "#2980B9" },
  { name: "Sagittarius", abbr: "Sg", symbol: "♐", element: "fire",  hue: "#C0392B" },
  { name: "Capricorn",   abbr: "Cp", symbol: "♑", element: "earth", hue: "#27AE60" },
  { name: "Aquarius",    abbr: "Aq", symbol: "♒", element: "air",   hue: "#C49A00" },
  { name: "Pisces",      abbr: "Pi", symbol: "♓", element: "water", hue: "#2980B9" },
];

const ELEMENT_BG = {
  fire:  "rgba(192,57,43,0.06)",
  earth: "rgba(39,174,96,0.06)",
  air:   "rgba(196,154,0,0.06)",
  water: "rgba(41,128,185,0.06)",
};

// Distinct orbit radius per planet — evenly spaced across the chart interior
const PLANETS = [
  { name: "Moon",    short: "Mo", symbol: "☽", color: "#3A6AAA", orbitFrac: 0.13 },
  { name: "Mercury", short: "Me", symbol: "☿", color: "#1A7A72", orbitFrac: 0.22 },
  { name: "Venus",   short: "Ve", symbol: "♀", color: "#A03030", orbitFrac: 0.31 },
  { name: "Sun",     short: "Su", symbol: "☉", color: "#A05800", orbitFrac: 0.40 },
  { name: "Mars",    short: "Ma", symbol: "♂", color: "#801818", orbitFrac: 0.49 },
  { name: "Jupiter", short: "Ju", symbol: "♃", color: "#503888", orbitFrac: 0.58 },
  { name: "Saturn",  short: "Sa", symbol: "♄", color: "#385060", orbitFrac: 0.67 },
  { name: "Rahu",    short: "Ra", symbol: "☊", color: "#186060", orbitFrac: 0.76 },
  { name: "Ketu",    short: "Ke", symbol: "☋", color: "#683050", orbitFrac: 0.76 },
];

function degToRad(d) { return d * Math.PI / 180; }

function signAndDeg(lon) {
  const si      = Math.floor(lon / 30) % 12;
  const dd      = lon % 30;
  const deg     = Math.floor(dd);
  const min     = Math.floor((dd - deg) * 60);
  const sec     = Math.floor(((dd - deg) * 60 - min) * 60);
  return { sign: ZODIAC_SIGNS[si], signIdx: si, degInSign: dd, deg, min, sec };
}

// ─── Nakshatra Data ───────────────────────────────────────────────────────────

const NAKSHATRAS = [
  { name: "Ashwini",          abbr: "Asw", lord: "Ke" },
  { name: "Bharani",          abbr: "Bha", lord: "Ve" },
  { name: "Krittika",         abbr: "Kri", lord: "Su" },
  { name: "Rohini",           abbr: "Roh", lord: "Mo" },
  { name: "Mrigashira",       abbr: "Mrg", lord: "Ma" },
  { name: "Ardra",            abbr: "Ard", lord: "Ra" },
  { name: "Punarvasu",        abbr: "Pun", lord: "Ju" },
  { name: "Pushya",           abbr: "Pus", lord: "Sa" },
  { name: "Ashlesha",         abbr: "Asl", lord: "Me" },
  { name: "Magha",            abbr: "Mag", lord: "Ke" },
  { name: "Purva Phalguni",   abbr: "PPh", lord: "Ve" },
  { name: "Uttara Phalguni",  abbr: "UPh", lord: "Su" },
  { name: "Hasta",            abbr: "Has", lord: "Mo" },
  { name: "Chitra",           abbr: "Chi", lord: "Ma" },
  { name: "Swati",            abbr: "Swa", lord: "Ra" },
  { name: "Vishakha",         abbr: "Vis", lord: "Ju" },
  { name: "Anuradha",         abbr: "Anu", lord: "Sa" },
  { name: "Jyeshtha",         abbr: "Jye", lord: "Me" },
  { name: "Mula",             abbr: "Mul", lord: "Ke" },
  { name: "Purva Ashadha",    abbr: "PAs", lord: "Ve" },
  { name: "Uttara Ashadha",   abbr: "UAs", lord: "Su" },
  { name: "Shravana",         abbr: "Shr", lord: "Mo" },
  { name: "Dhanishta",        abbr: "Dha", lord: "Ma" },
  { name: "Shatabhisha",      abbr: "Sha", lord: "Ra" },
  { name: "Purva Bhadrapada", abbr: "PBh", lord: "Ju" },
  { name: "Uttara Bhadrapada",abbr: "UBh", lord: "Sa" },
  { name: "Revati",           abbr: "Rev", lord: "Me" },
];

const NAK_SIZE  = 360 / 27;        // 13.333°
const PADA_SIZE = NAK_SIZE / 4;    // 3.333°

function nakshatraOf(lon) {
  const l    = norm360(lon);
  const idx  = Math.floor(l / NAK_SIZE);
  const within = l - idx * NAK_SIZE;
  const pada   = Math.floor(within / PADA_SIZE) + 1;
  const degInNak = within;
  return { ...NAKSHATRAS[idx], idx, pada, degInNak };
}

// ─── Chart Canvas ─────────────────────────────────────────────────────────────

function VedicChartCanvas({ positions, retrogrades, size }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width  = size + "px";
    canvas.style.height = size + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2;
    const R  = size / 2 - 10;

    // ── Full background ────────────────────────────────────
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R + 10);
    bgGrad.addColorStop(0,   "#FEFCF8");
    bgGrad.addColorStop(0.6, "#F5EFE0");
    bgGrad.addColorStop(1,   "#EAE0C8");
    ctx.beginPath(); ctx.arc(cx, cy, R + 10, 0, Math.PI * 2);
    ctx.fillStyle = bgGrad; ctx.fill();

    // Outer border
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(100,78,38,0.28)"; ctx.lineWidth = 1.5; ctx.stroke();

    // Layout radii
    const zodOuter = R * 0.99;   // outer edge of zodiac band
    const zodInner = R * 0.82;   // inner edge of zodiac band → planet area starts here
    const zodMid   = (zodOuter + zodInner) / 2;

    // Planets are spread from orbitMin to orbitMax inside zodInner
    // We'll use fixed pixel radii so they're evenly spaced with room
    const orbitMin = zodInner * 0.12;  // innermost orbit (Moon) — well clear of Earth
    const orbitMax = zodInner * 0.86;  // outermost orbit — just inside nakshatra ring

    // Pre-compute orbit radii per planet using their orbitFrac to map into [orbitMin, orbitMax]
    const minFrac = Math.min(...PLANETS.map(p => p.orbitFrac));
    const maxFrac = Math.max(...PLANETS.map(p => p.orbitFrac));
    const getOrbitR = (frac) =>
      orbitMin + ((frac - minFrac) / (maxFrac - minFrac)) * (orbitMax - orbitMin);

    // ── Zodiac band sectors (annular, NOT pie slices) ──────
    for (let i = 0; i < 12; i++) {
      const a0   = degToRad(90 - i * 30);
      const a1   = degToRad(90 - (i + 1) * 30);
      const sign = ZODIAC_SIGNS[i];

      // Annular sector fill (outer arc → inner arc, no line to centre)
      ctx.beginPath();
      ctx.arc(cx, cy, zodOuter, a0, a1, true);
      ctx.arc(cx, cy, zodInner, a1, a0, false);
      ctx.closePath();
      ctx.fillStyle = ELEMENT_BG[sign.element];
      ctx.fill();

      // Sector divider spoke (only in the band, not to centre)
      ctx.beginPath();
      ctx.moveTo(cx + zodInner * Math.cos(a0), cy + zodInner * Math.sin(a0));
      ctx.lineTo(cx + zodOuter * Math.cos(a0), cy + zodOuter * Math.sin(a0));
      ctx.strokeStyle = "rgba(100,78,38,0.22)"; ctx.lineWidth = 1; ctx.stroke();

      // 10° tick marks
      for (let d = 10; d < 30; d += 10) {
        const ta = degToRad(90 - (i * 30 + d));
        const t0 = zodInner;
        const t1 = zodInner + (zodOuter - zodInner) * 0.28;
        ctx.beginPath();
        ctx.moveTo(cx + t0 * Math.cos(ta), cy + t0 * Math.sin(ta));
        ctx.lineTo(cx + t1 * Math.cos(ta), cy + t1 * Math.sin(ta));
        ctx.strokeStyle = "rgba(100,78,38,0.16)"; ctx.lineWidth = 0.8; ctx.stroke();
      }

      // Symbol + abbr, rotated to fit in band
      const mid = degToRad(90 - (i * 30 + 15));
      ctx.save();
      ctx.translate(cx + zodMid * Math.cos(mid), cy + zodMid * Math.sin(mid));
      ctx.rotate(mid + Math.PI / 2);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `bold ${Math.round(size * 0.030)}px serif`;
      ctx.fillStyle = sign.hue;
      ctx.fillText(sign.symbol, 0, -size * 0.011);
      ctx.font = `600 ${Math.round(size * 0.018)}px ${FONT}`;
      ctx.fillStyle = sign.hue + "AA";
      ctx.fillText(sign.abbr, 0, size * 0.015);
      ctx.restore();
    }

    // Band border rings
    [zodOuter, zodInner].forEach(r => {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(100,78,38,0.32)"; ctx.lineWidth = 1.3; ctx.stroke();
    });

    // ── Nakshatra ring — thin band just inside zodiac ─────
    const nakOuter = zodInner;
    const nakInner = zodInner * 0.88;
    const nakMid   = (nakOuter + nakInner) / 2;

    for (let i = 0; i < 27; i++) {
      const a0 = degToRad(90 - i * NAK_SIZE);
      const a1 = degToRad(90 - (i + 1) * NAK_SIZE);

      // Alternating very subtle fill
      ctx.beginPath();
      ctx.arc(cx, cy, nakOuter, a0, a1, true);
      ctx.arc(cx, cy, nakInner, a1, a0, false);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? "rgba(100,78,38,0.04)" : "rgba(100,78,38,0.02)";
      ctx.fill();

      // Spoke at boundary
      ctx.beginPath();
      ctx.moveTo(cx + nakInner * Math.cos(a0), cy + nakInner * Math.sin(a0));
      ctx.lineTo(cx + nakOuter * Math.cos(a0), cy + nakOuter * Math.sin(a0));
      ctx.strokeStyle = "rgba(100,78,38,0.18)"; ctx.lineWidth = 0.6; ctx.stroke();

      // Pada ticks (3 internal ticks dividing into 4 padas)
      for (let p = 1; p < 4; p++) {
        const ta = degToRad(90 - (i * NAK_SIZE + p * PADA_SIZE));
        const t0 = nakInner, t1 = nakInner + (nakOuter - nakInner) * 0.35;
        ctx.beginPath();
        ctx.moveTo(cx + t0 * Math.cos(ta), cy + t0 * Math.sin(ta));
        ctx.lineTo(cx + t1 * Math.cos(ta), cy + t1 * Math.sin(ta));
        ctx.strokeStyle = "rgba(100,78,38,0.12)"; ctx.lineWidth = 0.5; ctx.stroke();
      }

      // Abbreviated name — rotated radially
      const midAngle = degToRad(90 - (i * NAK_SIZE + NAK_SIZE / 2));
      ctx.save();
      ctx.translate(cx + nakMid * Math.cos(midAngle), cy + nakMid * Math.sin(midAngle));
      ctx.rotate(midAngle + Math.PI / 2);
      ctx.font = `500 ${Math.round(size * 0.015)}px ${FONT}`;
      ctx.fillStyle = "rgba(80,55,25,0.65)";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(NAKSHATRAS[i].abbr, 0, 0);
      ctx.restore();
    }

    // Nakshatra ring borders
    [nakOuter, nakInner].forEach(r => {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(100,78,38,0.22)"; ctx.lineWidth = 0.8; ctx.stroke();
    });

    // ── Zodiac division lines extended to centre (faint) ───
    // These help see which sign a planet is transiting through
    for (let i = 0; i < 12; i++) {
      const a = degToRad(90 - i * 30);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + zodInner * Math.cos(a), cy + zodInner * Math.sin(a));
      ctx.strokeStyle = "rgba(100,78,38,0.07)"; ctx.lineWidth = 1; ctx.stroke();
    }

    // ── Orbit rings (dashed circles, no fill painting) ────
    const usedFracs = [...new Set(PLANETS.map(p => p.orbitFrac))];
    usedFracs.forEach(f => {
      const r = getOrbitR(f);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.setLineDash([3, 8]);
      ctx.strokeStyle = "rgba(100,78,38,0.13)"; ctx.lineWidth = 0.9;
      ctx.stroke(); ctx.setLineDash([]);
    });

    // ── Orbit halo rings (annular rings, NO fill inside) ──
    // Draw them as stroked wide rings using lineWidth instead of fill
    usedFracs.forEach(f => {
      const r = getOrbitR(f);
      const bw = Math.max(3, size * 0.014);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(140,110,55,0.06)";
      ctx.lineWidth = bw * 2;
      ctx.stroke();
    });

    // ── Radial lines from Earth to each planet (faint) ────
    PLANETS.forEach((p) => {
      const lon    = positions[p.name] ?? 0;
      const angle  = degToRad(90 - lon);
      const orbitR = getOrbitR(p.orbitFrac);
      const px     = cx + orbitR * Math.cos(angle);
      const py     = cy + orbitR * Math.sin(angle);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py);
      ctx.strokeStyle = p.color + "1A"; ctx.lineWidth = 0.8; ctx.stroke();
    });

    // ── Planets ───────────────────────────────────────────
    PLANETS.forEach((p) => {
      const lon     = positions[p.name] ?? 0;
      const angle   = degToRad(90 - lon);
      const orbitR  = getOrbitR(p.orbitFrac);
      const px      = cx + orbitR * Math.cos(angle);
      const py      = cy + orbitR * Math.sin(angle);
      const isRetro = retrogrades && retrogrades.has(p.name);

      // Perpendicular angle — 90° clockwise from radial
      // Name goes on the clockwise-perpendicular side of the dot
      const perpAngle = angle + Math.PI / 2;

      // Soft glow
      const gR = size * 0.034;
      const glow = ctx.createRadialGradient(px, py, 0, px, py, gR);
      glow.addColorStop(0,   p.color + "50");
      glow.addColorStop(0.6, p.color + "14");
      glow.addColorStop(1,   p.color + "00");
      ctx.beginPath(); ctx.arc(px, py, gR, 0, Math.PI * 2);
      ctx.fillStyle = glow; ctx.fill();

      // Planet dot
      const dotR = size * 0.018;
      ctx.beginPath(); ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.3; ctx.stroke();

      // ── Name label: perpendicular to radial (tangential)
      // Placed just beside the dot, along the orbit arc direction
      const nameOffset = dotR + size * 0.018;
      const nx = px + nameOffset * Math.cos(perpAngle);
      const ny = py + nameOffset * Math.sin(perpAngle);
      ctx.font = `700 ${Math.round(size * 0.023)}px ${FONT}`;
      ctx.fillStyle = p.color;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      // Rotate text to be tangential so it reads along the orbit
      ctx.save();
      ctx.translate(nx, ny);
      // Keep text upright — don't rotate, just offset tangentially
      ctx.textAlign = "center";
      ctx.fillText(isRetro ? `${p.short} ℞` : p.short, 0, 0);
      ctx.restore();

      // ── Degree label: just inside the orbit ring (towards Earth)
      // Placed radially inward from the dot, small and subtle
      const degOffset = dotR + size * 0.020;
      const { deg, min } = signAndDeg(lon);
      const degLabel = `${deg}°${String(min).padStart(2,"0")}′`;
      const dgx = px - degOffset * Math.cos(angle);
      const dgy = py - degOffset * Math.sin(angle);
      ctx.save();
      ctx.translate(dgx, dgy);
      ctx.rotate(angle + Math.PI / 2);
      ctx.font = `400 ${Math.round(size * 0.015)}px ${FONT}`;
      ctx.fillStyle = p.color + "99";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(degLabel, 0, 0);
      ctx.restore();
    });

    // ── Earth at centre (smaller, clean) ──────────────────
    const er = size * 0.032;  // smaller — ~6px on 200px chart, ~15px on 480px
    const eg = ctx.createRadialGradient(cx - er * 0.35, cy - er * 0.35, 0, cx, cy, er);
    eg.addColorStop(0,   "#7EC8E8");
    eg.addColorStop(0.5, "#1A76C2");
    eg.addColorStop(1,   "#073B8A");
    ctx.beginPath(); ctx.arc(cx, cy, er, 0, Math.PI * 2);
    ctx.fillStyle = eg; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.70)"; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.font = `${Math.round(size * 0.022)}px serif`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🜨", cx, cy);

  }, [positions, retrogrades, size]);

  return <canvas ref={canvasRef} style={{ borderRadius: "50%", display: "block" }} />;
}

// ─── Planet Table ─────────────────────────────────────────────────────────────

function PlanetTable({ d1Pos, d9Pos, retrogrades }) {
  const th = { padding: "8px 12px", textAlign: "left", color: "#6B5A3A",
    fontWeight: 600, fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
    borderBottom: "2px solid #D8CCAA", fontFamily: FONT };
  const td = { padding: "8px 12px", fontFamily: FONT, fontSize: 13 };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Planet</th>
            <th style={{ ...th, textAlign: "center" }}></th>
            <th style={th}>D1 Sign</th>
            <th style={th}>D1 Deg (in sign)</th>
            <th style={th}>D9 Sign</th>
            <th style={th}>D9 Deg (in sign)</th>
          </tr>
        </thead>
        <tbody>
          {PLANETS.map((p, i) => {
            const s1   = signAndDeg(d1Pos[p.name] ?? 0);
            const s9   = signAndDeg(d9Pos[p.name] ?? 0);
            const nak1 = nakshatraOf(d1Pos[p.name] ?? 0);
            const isRetro = retrogrades && retrogrades.has(p.name);
            return (
              <tr key={p.name} style={{ background: i % 2 === 0 ? "rgba(200,184,144,0.09)" : "transparent",
                borderBottom: "1px solid rgba(200,184,144,0.25)" }}>
                <td style={{ ...td, fontWeight: 700, color: "#2A1E0A" }}>
                  {p.name}
                  {isRetro && <span style={{ color: "#991111", fontSize: 11, marginLeft: 5 }}>℞</span>}
                </td>
                <td style={{ ...td, textAlign: "center", fontSize: 16, color: p.color }}>{p.symbol}</td>
                <td style={{ ...td }}>
                  <span style={{ color: s1.sign.hue, marginRight: 5, fontSize: 15 }}>{s1.sign.symbol}</span>
                  <span style={{ color: "#3A2A10" }}>{s1.sign.name}</span>
                </td>
                <td style={{ ...td, fontFamily: "monospace", color: "#5A4020" }}>
                  {s1.deg}°{String(s1.min).padStart(2,"0")}′
                </td>
                <td style={{ ...td, color: "#3A2A10" }}>
                  <span style={{ fontWeight: 600 }}>{nak1.name}</span>
                  <span style={{ color: "#8A6A30", fontSize: 11, marginLeft: 5 }}>({nak1.lord})</span>
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  <span style={{
                    display: "inline-block", width: 22, height: 22, lineHeight: "22px",
                    borderRadius: "50%", background: "#7A6040", color: "#FFF7E6",
                    fontSize: 11, fontWeight: 700, textAlign: "center",
                  }}>{nak1.pada}</span>
                </td>
                <td style={{ ...td }}>
                  <span style={{ color: s9.sign.hue, marginRight: 5, fontSize: 15 }}>{s9.sign.symbol}</span>
                  <span style={{ color: "#3A2A10" }}>{s9.sign.name}</span>
                </td>
                <td style={{ ...td, fontFamily: "monospace", color: "#5A4020" }}>
                  {s9.deg}°{String(s9.min).padStart(2,"0")}′
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

const RANGE_OPTIONS = [
  { label: "90 days",  days: 90  },
  { label: "180 days", days: 180 },
  { label: "365 days", days: 365 },
];

export default function VedicAstrology() {
  const now = new Date();
  const toLocal = (d) => {
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [baseDate,    setBaseDate]    = useState(toLocal(now));
  const [sliderVal,   setSliderVal]   = useState(0);
  const [rangeDays,   setRangeDays]   = useState(90);
  const [activeChart, setActiveChart] = useState("D1");
  const [playing,     setPlaying]     = useState(false);
  const playRef      = useRef(null);
  const containerRef = useRef(null);
  const [chartSize, setChartSize]     = useState(420);

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      setChartSize(Math.min(480, Math.max(260, w - 24)));
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const rangeHours = rangeDays * 24;

  const effectiveDate = useCallback(() => {
    const d = new Date(baseDate);
    d.setHours(d.getHours() + sliderVal);
    return d;
  }, [baseDate, sliderVal]);

  const effDate    = effectiveDate();
  const d1Pos      = computePlanetaryPositions(effDate);
  const retros     = computeRetrogrades(effDate);
  const d9Pos      = {};
  for (const k in d1Pos) d9Pos[k] = toNavamsa(d1Pos[k]);
  const displayPos = activeChart === "D1" ? d1Pos : d9Pos;

  useEffect(() => {
    if (playing) {
      playRef.current = setInterval(() => {
        setSliderVal(v => {
          const next = v + 12;
          if (next > rangeHours) { setPlaying(false); return rangeHours; }
          return next;
        });
      }, 80);
    } else clearInterval(playRef.current);
    return () => clearInterval(playRef.current);
  }, [playing, rangeHours]);

  useEffect(() => {
    setSliderVal(v => Math.max(-rangeHours, Math.min(rangeHours, v)));
  }, [rangeHours]);

  const fmtOffset = (hrs) => {
    if (hrs === 0) return "Base time";
    const sign = hrs < 0 ? "−" : "+";
    const abs  = Math.abs(hrs);
    const d    = Math.floor(abs / 24), h = abs % 24;
    return d > 0 ? `${sign}${d}d ${h}h` : `${sign}${h}h`;
  };

  const effStr = effDate.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  const card = {
    background: "#FDFAF4", border: "1px solid #D8CCAA", borderRadius: 14,
    padding: "16px 20px", marginBottom: 14,
    boxShadow: "0 2px 8px rgba(120,90,40,0.07)",
  };
  const label = {
    fontSize: 11, letterSpacing: 1.5, color: "#8A6A30",
    textTransform: "uppercase", fontWeight: 600, fontFamily: FONT, marginBottom: 10,
  };
  const btnBase = {
    padding: "7px 16px", borderRadius: 7, cursor: "pointer", fontFamily: FONT,
    fontSize: 12, fontWeight: 500, border: "1.5px solid #C8B890", transition: "all 0.15s",
  };
  const btnOn  = { ...btnBase, background: "#6A5030", color: "#FFF7E6", borderColor: "#6A5030" };
  const btnOff = { ...btnBase, background: "transparent", color: "#6A5030" };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#F7F2E6 0%,#EDE4CC 100%)",
      fontFamily: FONT, color: "#2A1E0A", padding: "20px 12px 48px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 10, letterSpacing: 5, color: "#9A7A30", textTransform: "uppercase",
            marginBottom: 6, fontWeight: 600 }}>
            Jyotish · Vedic Astrology
          </div>
          <h1 style={{ margin: 0, fontWeight: 700, letterSpacing: 0.5,
            fontSize: "clamp(22px,5vw,34px)", color: "#3A2808" }}>
            Geocentric Chart Viewer
          </h1>
          <div style={{ color: "#9A8050", fontSize: 13, marginTop: 5, fontWeight: 400 }}>
            Lahiri Ayanamsa · Sidereal · Earth as Centre
          </div>
        </div>

        {/* Datetime */}
        <div style={card}>
          <div style={label}>Birth / Reference Date & Time</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input type="datetime-local" value={baseDate}
              onChange={e => { setBaseDate(e.target.value); setSliderVal(0); }}
              style={{ padding: "9px 12px", borderRadius: 8, border: "1.5px solid #C8B890",
                background: "#FFF8EE", color: "#3A2808", fontFamily: FONT,
                fontSize: 14, outline: "none", flex: 1, minWidth: 200 }}
            />
            <button onClick={() => { setBaseDate(toLocal(new Date())); setSliderVal(0); }} style={btnOff}>
              Now
            </button>
          </div>
        </div>

        {/* Slider */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
            <div style={label}>Time Slider</div>
            <div style={{ fontSize: 13, color: "#5A4020", fontWeight: 500 }}>
              {effStr}
              {sliderVal !== 0 && (
                <span style={{ color: "#8A2010", marginLeft: 8 }}>{fmtOffset(sliderVal)}</span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#8A6A30", fontWeight: 600, marginRight: 4 }}>Range:</span>
            {RANGE_OPTIONS.map(opt => (
              <button key={opt.days} onClick={() => setRangeDays(opt.days)}
                style={rangeDays === opt.days
                  ? { ...btnOn,  padding: "4px 12px", fontSize: 11 }
                  : { ...btnOff, padding: "4px 12px", fontSize: 11 }}>
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#9A8050", whiteSpace: "nowrap" }}>−{rangeDays}d</span>
            <input type="range" min={-rangeHours} max={rangeHours} step={6} value={sliderVal}
              onChange={e => setSliderVal(Number(e.target.value))}
              style={{ flex: 1, accentColor: "#7A5020" }} />
            <span style={{ fontSize: 11, color: "#9A8050", whiteSpace: "nowrap" }}>+{rangeDays}d</span>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => { setSliderVal(0); setPlaying(false); }} style={{ ...btnOff, padding: "5px 12px", fontSize: 11 }}>
              Reset
            </button>
            <button onClick={() => setPlaying(p => !p)}
              style={playing
                ? { ...btnOn,  padding: "5px 16px", fontSize: 12 }
                : { ...btnOff, padding: "5px 16px", fontSize: 12 }}>
              {playing ? "⏸ Pause" : "▶ Play"}
            </button>
          </div>
        </div>

        {/* D1 / D9 toggle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <div style={{ border: "1.5px solid #C8B890", borderRadius: 10, overflow: "hidden", display: "inline-flex" }}>
            {["D1","D9"].map(c => (
              <button key={c} onClick={() => setActiveChart(c)} style={{
                padding: "10px 44px",
                background: activeChart === c ? "#6A5030" : "transparent",
                border: "none", cursor: "pointer",
                color: activeChart === c ? "#FFF7E6" : "#6A5030",
                fontFamily: FONT, fontSize: 15, fontWeight: 700, letterSpacing: 1,
              }}>
                {c}
                <span style={{ fontSize: 11, display: "block", fontWeight: 400, opacity: 0.75, marginTop: 1 }}>
                  {c === "D1" ? "Rasi" : "Navamsa"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div ref={containerRef} style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div style={{ padding: 8, borderRadius: "50%", background: "#FDFAF4",
            boxShadow: "0 4px 28px rgba(100,80,30,0.14), 0 1px 4px rgba(100,80,30,0.08)" }}>
            <VedicChartCanvas positions={displayPos} retrogrades={retros} size={chartSize} />
          </div>
        </div>

        {/* Retrograde summary */}
        {retros.size > 0 && (
          <div style={{ textAlign: "center", marginBottom: 12, fontSize: 13,
            color: "#8A1010", fontWeight: 500 }}>
            ℞ Retrograde: {[...retros].join(" · ")}
          </div>
        )}

        {/* Table */}
        <div style={card}>
          <div style={{ ...label, marginBottom: 14 }}>Planetary Positions · Degrees within Sign (0° – 30°)</div>
          <PlanetTable d1Pos={d1Pos} d9Pos={d9Pos} retrogrades={retros} />
        </div>

        <div style={{ textAlign: "center", color: "#B09860", fontSize: 11, lineHeight: 1.9 }}>
          Positions computed using mean orbital elements with Lahiri ayanamsa.<br />
          For precise Jyotish work, verify with dedicated ephemeris software.
        </div>
      </div>
    </div>
  );
}
