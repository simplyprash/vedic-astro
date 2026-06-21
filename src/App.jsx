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
            <th style={th}>Deg</th>
            <th style={th}>Nakshatra</th>
            <th style={{ ...th, textAlign: "center" }}>Pada</th>
            <th style={th}>D9 Sign</th>
            <th style={th}>D9 Deg</th>
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


// ─── Sarvatobhadra Chakra ─────────────────────────────────────────────────────
//
// The SBC is a 9×9 grid. The 28 nakshatras (27 + Abhijit) are arranged around
// the perimeter and inward rows in a specific fixed sequence.
// Vowels (swaras) and consonants (vyanjanas) occupy the inner cells.
//
// Fixed SBC nakshatra layout — the 28 positions going N→E→S→W from centre
// Each nakshatra occupies one cell; planets fall in their nakshatra's cell.

// The 28 SBC nakshatras (27 + Abhijit between Uttara Ashadha & Shravana)
const SBC_NAKS = [
  "Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya",
  "Ashlesha","Magha","Purva Phalguni","Uttara Phalguni","Hasta","Chitra","Swati",
  "Vishakha","Anuradha","Jyeshtha","Mula","Purva Ashadha","Uttara Ashadha","Abhijit",
  "Shravana","Dhanishta","Shatabhisha","Purva Bhadrapada","Uttara Bhadrapada","Revati"
];

// Map standard 27-nakshatra index → SBC_NAKS index (Abhijit inserted at 21)
function stdToSbc(stdIdx) {
  if (stdIdx < 21) return stdIdx;       // 0–20 same
  return stdIdx + 1;                    // 21–26 shift by 1 (Abhijit at 21)
}

// The SBC grid is 9×9. Rows 0-8 (top→bottom), Cols 0-8 (left→right).
// Nakshatras occupy the outer ring and 3 inner rings.
// Standard mapping (Parashara tradition):
// Outer ring (row0, row8, col0, col8) = 28 cells for 28 nakshatras
// Inner cells = swaras (vowels) and vyanjanas (consonants)

// Build the 9×9 cell definitions
// Each cell: { type: "nak"|"swara"|"vyanjana"|"brahma", value, row, col }

// Nakshatra sequence around perimeter (clockwise from top-left):
// Top row L→R: naks 0–8 (Ashwini→Ashlesha)
// Right col T→B (skip corners): naks 9–15 (Magha→Vishakha)  
// Bottom row R→L: naks 16–22 (Anuradha→Shravana) [skip last corner]
// Left col B→T (skip corners): naks 23–27 (Dhanishta→Revati)

// Perimeter positions (row, col) in order:
const PERIMETER = [
  // Top row left to right (row 0, col 0..8)
  [0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],
  // Right col top to bottom (col 8, row 1..8)
  [1,8],[2,8],[3,8],[4,8],[5,8],[6,8],[7,8],[8,8],
  // Bottom row right to left (row 8, col 7..0)
  [8,7],[8,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  // Left col bottom to top (col 0, row 7..1)
  [7,0],[6,0],[5,0],[4,0],[3,0],[2,0],[1,0],
];
// 9 + 8 + 8 + 7 = 32 positions, but we have 28 nakshatras
// The standard SBC assigns nakshatras only to the 28 non-corner perimeter cells
// Corners hold special symbols. Let me use the proper fixed layout:

// Fixed cell assignments — each [row,col] → nakshatra index in SBC_NAKS
// Based on traditional Parashara SBC (N at top, starts from Ashwini at top-left corner)
const NAK_CELLS = {
  // Top row (row=0)
  "0,0": 0,  // Ashwini
  "0,1": 1,  // Bharani
  "0,2": 2,  // Krittika
  "0,3": 3,  // Rohini
  "0,4": 4,  // Mrigashira
  "0,5": 5,  // Ardra
  "0,6": 6,  // Punarvasu
  "0,7": 7,  // Pushya
  "0,8": 8,  // Ashlesha
  // Right col (col=8, rows 1-8)
  "1,8": 9,  // Magha
  "2,8": 10, // Purva Phalguni
  "3,8": 11, // Uttara Phalguni
  "4,8": 12, // Hasta
  "5,8": 13, // Chitra
  "6,8": 14, // Swati
  "7,8": 15, // Vishakha
  "8,8": 16, // Anuradha
  // Bottom row (row=8, right to left)
  "8,7": 17, // Jyeshtha
  "8,6": 18, // Mula
  "8,5": 19, // Purva Ashadha
  "8,4": 20, // Uttara Ashadha
  "8,3": 21, // Abhijit
  "8,2": 22, // Shravana
  "8,1": 23, // Dhanishta
  "8,0": 24, // Shatabhisha
  // Left col (col=0, bottom to top)
  "7,0": 25, // Purva Bhadrapada
  "6,0": 26, // Uttara Bhadrapada
  "5,0": 27, // Revati
  // Inner ring continues...
  // Row 1, cols 1-7
  "1,1": null, "1,2": null, "1,3": null, "1,4": null, "1,5": null, "1,6": null, "1,7": null,
  // ...inner cells are vowels/consonants
};

// Swaras (vowels) — placed in inner ring top row (row 1, cols 1-7) and symmetrically
const SWARAS = ["अ","आ","इ","ई","उ","ऊ","ए","ऐ","ओ","औ","अं","अः","ऋ","ॠ","लृ"];
// Vyanjanas (consonants) in inner cells
const VYANJANAS = ["क","ख","ग","घ","ङ","च","छ","ज","झ","ञ","ट","ठ","ड","ढ","ण","त","थ","द","ध","न","प","फ","ब","भ","म","य","र","ल","व","श","ष","स","ह","क्ष"];

// Inner cell content (row 1-7, col 1-7 = 7x7 inner grid)
// Arranged by tradition: vowels in ring1, consonants in ring2, Brahma at centre
// Ring 1 (rows 1-7 boundary of inner): 24 cells → swaras
// Ring 2 (rows 2-6 boundary): 16 cells → vyanjanas  
// Centre (3x3): directions + Brahma

const DIRECTIONS = {
  "1,4": "N", "4,7": "E", "7,4": "S", "4,1": "W",
  "1,1": "NW","1,7": "NE","7,1": "SW","7,7": "SE",
};

// Build inner ring positions in order
function innerRing1() {
  const cells = [];
  for (let c = 1; c <= 7; c++) cells.push([1, c]); // top
  for (let r = 2; r <= 7; r++) cells.push([r, 7]); // right
  for (let c = 6; c >= 1; c--) cells.push([7, c]); // bottom
  for (let r = 6; r >= 2; r--) cells.push([r, 1]); // left
  return cells;
}
function innerRing2() {
  const cells = [];
  for (let c = 2; c <= 6; c++) cells.push([2, c]);
  for (let r = 3; r <= 6; r++) cells.push([r, 6]);
  for (let c = 5; c >= 2; c--) cells.push([6, c]);
  for (let r = 5; r >= 3; r--) cells.push([r, 2]);
  return cells;
}

// Build full 9×9 grid cells
function buildSBCGrid() {
  const grid = [];
  for (let r = 0; r < 9; r++) {
    const row = [];
    for (let c = 0; c < 9; c++) {
      const key = `${r},${c}`;
      if (NAK_CELLS[key] !== undefined && NAK_CELLS[key] !== null) {
        row.push({ type: "nak", nakIdx: NAK_CELLS[key], name: SBC_NAKS[NAK_CELLS[key]] });
      } else {
        row.push({ type: "inner", r, c });
      }
    }
    grid.push(row);
  }

  // Fill inner ring 1 with swaras
  const r1 = innerRing1();
  r1.forEach(([r, c], i) => {
    grid[r][c] = { type: "swara", value: SWARAS[i % SWARAS.length] };
  });

  // Fill inner ring 2 with vyanjanas
  const r2 = innerRing2();
  r2.forEach(([r, c], i) => {
    grid[r][c] = { type: "vyanjana", value: VYANJANAS[i % VYANJANAS.length] };
  });

  // Centre 3×3
  const centreLabels = [
    ["NW","N","NE"],
    ["W", "☯","E"],
    ["SW","S","SE"],
  ];
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      const r = 3 + dr, c = 3 + dc;
      const lbl = centreLabels[dr][dc];
      grid[r][c] = { type: lbl === "☯" ? "brahma" : "direction", value: lbl };
    }
  }

  return grid;
}

// Get which SBC nakshatra index a planet occupies
function planetSbcNak(lon) {
  const stdIdx = Math.floor(norm360(lon) / (360 / 27)); // 0-26
  return stdToSbc(stdIdx); // 0-27
}

// Vedha (affliction) rules — sign-based aspects from each planet's nakshatra
// A planet vedhas the nakshatra directly opposite (7th) and specific others
// Based on traditional Parashara rules:
function getVedhas(planets) {
  // For each planet, find which nakshatras it aspects (vedhas)
  // Rules: all planets aspect the 1st (self), and the following from their nak:
  // Sun,Moon,Mercury,Venus: 1,3,5,7 (counted from their nak)
  // Mars,Saturn: 1,4,7,10 
  // Jupiter: 1,5,7,9
  // Rahu,Ketu: 1,7 + special
  const VEDHA_OFFSETS = {
    Sun:     [0, 2, 4, 6],
    Moon:    [0, 2, 4, 6],
    Mercury: [0, 2, 4, 6],
    Venus:   [0, 2, 4, 6],
    Mars:    [0, 3, 6, 9],
    Saturn:  [0, 3, 6, 9],
    Jupiter: [0, 4, 6, 8],
    Rahu:    [0, 6, 13],
    Ketu:    [0, 6, 13],
  };
  const vedhas = {}; // nakIdx → [planet names]
  for (const [pName, lon] of Object.entries(planets)) {
    const offsets = VEDHA_OFFSETS[pName] || [0, 6];
    const baseNak = planetSbcNak(lon);
    for (const off of offsets) {
      const targetNak = (baseNak + off) % 28;
      if (!vedhas[targetNak]) vedhas[targetNak] = [];
      if (!vedhas[targetNak].includes(pName)) vedhas[targetNak].push(pName);
    }
  }
  return vedhas;
}

// ─── SBC Component ────────────────────────────────────────────────────────────

function SarvatobhadraChakra({ d1Pos, retrogrades, moonNakIdx }) {
  const grid    = buildSBCGrid();
  const vedhas  = getVedhas(d1Pos);

  // Which nakshatra cell has each planet
  const planetNaks = {};
  for (const [name, lon] of Object.entries(d1Pos)) {
    planetNaks[name] = planetSbcNak(lon);
  }

  // Planet abbreviations & colours (reuse from PLANETS)
  const pInfo = {};
  PLANETS.forEach(p => { pInfo[p.name] = { short: p.short, color: p.color }; });

  const CELL = 52; // px per cell
  const GRID = CELL * 9;

  // Colors
  const nakBg    = "#FFF8EE";
  const innerBg  = "#FDFAF4";
  const swaraBg  = "#F0EAD8";
  const vyanBg   = "#F5F0E4";
  const brahmaBg = "#7A6040";
  const dirBg    = "#EDE4CC";
  const border   = "rgba(100,78,38,0.18)";

  // Determine if a cell has a vedha
  const cellVedha = (nakIdx) => vedhas[nakIdx] || [];

  // Moon's nakshatra highlighted as Janma nakshatra
  const isJanma = (nakIdx) => nakIdx === moonNakIdx;

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "inline-block", position: "relative" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(9, ${CELL}px)`,
            gridTemplateRows:    `repeat(9, ${CELL}px)`,
            border: `2px solid rgba(100,78,38,0.35)`,
            borderRadius: 4,
          }}>
            {grid.map((row, ri) => row.map((cell, ci) => {
              const isNak    = cell.type === "nak";
              const nakIdx   = isNak ? cell.nakIdx : null;
              const planets  = isNak ? PLANETS.filter(p => planetNaks[p.name] === nakIdx) : [];
              const vlist    = isNak ? cellVedha(nakIdx) : [];
              const janma    = isNak && isJanma(nakIdx);
              const isBrahma = cell.type === "brahma";
              const isDir    = cell.type === "direction";
              const isSwara  = cell.type === "swara";
              const isVyan   = cell.type === "vyanjana";

              let bg = innerBg;
              if (isNak)    bg = janma ? "#FFF0CC" : nakBg;
              if (isSwara)  bg = swaraBg;
              if (isVyan)   bg = vyanBg;
              if (isBrahma) bg = brahmaBg;
              if (isDir)    bg = dirBg;

              // Vedha highlight — light red tint if afflicted by malefic
              const malefics = ["Mars","Saturn","Rahu","Ketu","Sun"];
              const hasMaleficVedha = vlist.some(v => malefics.includes(v));
              const hasBeneficVedha = vlist.some(v => ["Jupiter","Venus","Moon","Mercury"].includes(v));
              if (isNak && hasMaleficVedha && !janma) bg = "rgba(192,57,43,0.08)";
              if (isNak && hasBeneficVedha && !hasMaleficVedha) bg = "rgba(39,174,96,0.08)";
              if (isNak && janma) bg = "#FFEEBB";

              return (
                <div key={`${ri}-${ci}`} style={{
                  width: CELL, height: CELL,
                  background: bg,
                  border: `1px solid ${border}`,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  position: "relative", overflow: "hidden",
                  boxSizing: "border-box",
                }}>
                  {isNak && (
                    <>
                      {/* Nakshatra name */}
                      <div style={{
                        fontSize: 8.5, fontWeight: 600, color: "#5A3A10",
                        textAlign: "center", lineHeight: 1.2,
                        padding: "0 2px",
                        fontFamily: FONT,
                      }}>
                        {SBC_NAKS[nakIdx].replace(" ", "\n").split("\n").map((w,i) =>
                          <div key={i}>{w}</div>
                        )}
                      </div>

                      {/* Janma marker */}
                      {janma && (
                        <div style={{ fontSize: 7, color: "#8A5010", fontWeight: 700 }}>★ Janma</div>
                      )}

                      {/* Planet dots */}
                      {planets.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 1, justifyContent: "center", marginTop: 2 }}>
                          {planets.map(p => (
                            <span key={p.name} title={p.name} style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 14, height: 14, borderRadius: "50%",
                              background: p.color, color: "#fff",
                              fontSize: 7, fontWeight: 700, fontFamily: FONT,
                              border: retrogrades && retrogrades.has(p.name) ? "1px solid #991111" : "none",
                            }}>
                              {p.short[0]}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Vedha indicators */}
                      {vlist.length > 0 && planets.length === 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 1, justifyContent: "center", marginTop: 1 }}>
                          {vlist.map(v => {
                            const info = pInfo[v];
                            return (
                              <span key={v} title={`Vedha by ${v}`} style={{
                                display: "inline-block",
                                width: 10, height: 10, borderRadius: "50%",
                                background: info ? info.color + "55" : "#ccc",
                                border: `1px solid ${info ? info.color : "#aaa"}`,
                                fontSize: 6,
                              }} />
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {isSwara && (
                    <div style={{ fontSize: 13, color: "#4A3010", fontFamily: "serif" }}>{cell.value}</div>
                  )}
                  {isVyan && (
                    <div style={{ fontSize: 12, color: "#6A4820", fontFamily: "serif" }}>{cell.value}</div>
                  )}
                  {isBrahma && (
                    <div style={{ fontSize: 11, color: "#FFF7E6", fontWeight: 700, textAlign: "center", fontFamily: FONT }}>
                      <div style={{ fontSize: 16 }}>☸</div>
                      <div>Brahma</div>
                    </div>
                  )}
                  {isDir && (
                    <div style={{ fontSize: 11, color: "#8A6A30", fontWeight: 600, fontFamily: FONT }}>{cell.value}</div>
                  )}
                </div>
              );
            }))}
          </div>
        </div>
      </div>

      {/* Vedha Analysis */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: 1.5, color: "#8A6A30",
          textTransform: "uppercase", fontWeight: 600, fontFamily: FONT, marginBottom: 12 }}>
          Vedha Analysis
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
          {PLANETS.map(p => {
            const nakIdx  = planetNaks[p.name];
            const nakName = SBC_NAKS[nakIdx];
            const VEDHA_OFFSETS = {
              Sun:[0,2,4,6], Moon:[0,2,4,6], Mercury:[0,2,4,6], Venus:[0,2,4,6],
              Mars:[0,3,6,9], Saturn:[0,3,6,9], Jupiter:[0,4,6,8],
              Rahu:[0,6,13], Ketu:[0,6,13],
            };
            const offsets = VEDHA_OFFSETS[p.name] || [0,6];
            const aspectedNaks = offsets.map(o => SBC_NAKS[(nakIdx + o) % 28]);
            const isRetro = retrogrades && retrogrades.has(p.name);
            return (
              <div key={p.name} style={{
                background: "#FDFAF4", border: `1px solid ${p.color}44`,
                borderRadius: 8, padding: "8px 12px",
                borderLeft: `3px solid ${p.color}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ color: p.color, fontSize: 15 }}>{p.symbol}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#2A1E0A" }}>{p.name}</span>
                  {isRetro && <span style={{ color: "#991111", fontSize: 11 }}>℞</span>}
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "#8A6A30" }}>{nakName}</span>
                </div>
                <div style={{ fontSize: 11, color: "#6A5030", lineHeight: 1.6 }}>
                  <span style={{ color: "#8A6A30" }}>Vedha on: </span>
                  {aspectedNaks.map((n, i) => (
                    <span key={i}>
                      {i > 0 && <span style={{ color: "#B0905A" }}> · </span>}
                      <span style={{
                        color: n === nakName ? p.color : "#3A2A10",
                        fontWeight: n === nakName ? 700 : 400,
                      }}>{n}</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ marginTop: 16, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: "#8A6A30" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#FFEEBB", border: "1px solid #C8A040", marginRight: 4 }}/>Janma nakshatra (Moon)</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "rgba(192,57,43,0.08)", border: "1px solid #C03020", marginRight: 4 }}/>Malefic vedha</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "rgba(39,174,96,0.08)", border: "1px solid #279060", marginRight: 4 }}/>Benefic vedha</span>
        <span>Solid circle = planet present · Hollow circle = vedha only</span>
      </div>
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
  const moonNakIdx = d1Pos.Moon !== undefined ? stdToSbc(Math.floor(norm360(d1Pos.Moon) / (360/27))) : 0;

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

        {/* Sarvatobhadra Chakra */}
        <div style={card}>
          <div style={{ ...label, marginBottom: 16 }}>Sarvatobhadra Chakra</div>
          <SarvatobhadraChakra d1Pos={d1Pos} retrogrades={retros} moonNakIdx={moonNakIdx} />
        </div>

        <div style={{ textAlign: "center", color: "#B09860", fontSize: 11, lineHeight: 1.9 }}>
          Positions computed using astronomy-engine with Lahiri ayanamsa.<br />
          For precise Jyotish work, verify with dedicated ephemeris software.
        </div>
      </div>
    </div>
  );
}
