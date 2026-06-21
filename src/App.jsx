import { useState, useEffect, useRef, useCallback } from "react";

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

function lahiriAyanamsa(T) { return 23.85 + 0.0137 * T * 100; }

// Returns { name: longitude } sidereal degrees
function computePlanetaryPositions(date) {
  const jd = julianDay(date);
  const T  = (jd - 2451545.0) / 36525;
  const aya = lahiriAyanamsa(T);
  const L = {
    Sun:     norm360(280.46646 + 36000.76983 * T),
    Moon:    norm360(218.3165  + 481267.8813 * T),
    Mars:    norm360(355.433   +  19140.299  * T),
    Mercury: norm360(252.251   + 149472.674  * T),
    Jupiter: norm360(34.351    +   3034.906  * T),
    Venus:   norm360(181.979   +  58517.816  * T),
    Saturn:  norm360(50.077    +   1222.114  * T),
    Rahu:    norm360(125.044   -   1934.136  * T),
  };
  L.Ketu = norm360(L.Rahu + 180);
  const sid = {};
  for (const k in L) sid[k] = norm360(L[k] - aya);
  return sid;
}

// Check retrograde by comparing position 24h apart
// Returns set of retrograde planet names
function computeRetrogrades(date) {
  const yesterday = new Date(date.getTime() - 86400000);
  const pos0 = computePlanetaryPositions(yesterday);
  const pos1 = computePlanetaryPositions(date);
  const retro = new Set();
  // A planet is retrograde if its longitude decreased (accounting for 0/360 wrap)
  const retroCandidates = ["Mercury","Venus","Mars","Jupiter","Saturn"];
  for (const p of retroCandidates) {
    let diff = pos1[p] - pos0[p];
    // Normalize for wrap
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (diff < 0) retro.add(p);
  }
  // Rahu/Ketu always retrograde
  retro.add("Rahu"); retro.add("Ketu");
  return retro;
}

function toNavamsa(sidLong) {
  const sign = Math.floor(sidLong / 30);
  const pos  = sidLong % 30;
  const navPart = Math.floor(pos / (30 / 9));
  const starts = [0, 9, 6, 3];
  const elements = [0,1,2,3,0,1,2,3,0,1,2,3];
  const startSign = (starts[elements[sign]] + navPart) % 12;
  return norm360(startSign * 30 + 15);
}

// ─── Static Data ──────────────────────────────────────────────────────────────

const ZODIAC_SIGNS = [
  { name: "Aries",       symbol: "♈", element: "fire",  hue: "#C0392B" },
  { name: "Taurus",      symbol: "♉", element: "earth", hue: "#27AE60" },
  { name: "Gemini",      symbol: "♊", element: "air",   hue: "#D4AC0D" },
  { name: "Cancer",      symbol: "♋", element: "water", hue: "#2980B9" },
  { name: "Leo",         symbol: "♌", element: "fire",  hue: "#C0392B" },
  { name: "Virgo",       symbol: "♍", element: "earth", hue: "#27AE60" },
  { name: "Libra",       symbol: "♎", element: "air",   hue: "#D4AC0D" },
  { name: "Scorpio",     symbol: "♏", element: "water", hue: "#2980B9" },
  { name: "Sagittarius", symbol: "♐", element: "fire",  hue: "#C0392B" },
  { name: "Capricorn",   symbol: "♑", element: "earth", hue: "#27AE60" },
  { name: "Aquarius",    symbol: "♒", element: "air",   hue: "#D4AC0D" },
  { name: "Pisces",      symbol: "♓", element: "water", hue: "#2980B9" },
];

const ELEMENT_BG = {
  fire:  "rgba(192,57,43,0.07)",
  earth: "rgba(39,174,96,0.07)",
  air:   "rgba(212,172,13,0.07)",
  water: "rgba(41,128,185,0.07)",
};

const PLANETS = [
  { name: "Moon",    short: "Mo", symbol: "☽", color: "#5578AA", orbitFrac: 0.18 },
  { name: "Mercury", short: "Me", symbol: "☿", color: "#2A8A82", orbitFrac: 0.26 },
  { name: "Venus",   short: "Ve", symbol: "♀", color: "#A84040", orbitFrac: 0.34 },
  { name: "Sun",     short: "Su", symbol: "☉", color: "#B86A00", orbitFrac: 0.42 },
  { name: "Mars",    short: "Ma", symbol: "♂", color: "#902020", orbitFrac: 0.50 },
  { name: "Jupiter", short: "Ju", symbol: "♃", color: "#604898", orbitFrac: 0.58 },
  { name: "Saturn",  short: "Sa", symbol: "♄", color: "#486070", orbitFrac: 0.66 },
  { name: "Rahu",    short: "Ra", symbol: "☊", color: "#286070", orbitFrac: 0.74 },
  { name: "Ketu",    short: "Ke", symbol: "☋", color: "#784060", orbitFrac: 0.74 },
];

function degToRad(d) { return d * Math.PI / 180; }

// Returns sign (0-11), degrees within sign (0-30), minutes
function signAndDeg(lon) {
  const si  = Math.floor(lon / 30) % 12;
  const dd  = lon % 30;
  const deg = Math.floor(dd);
  const min = Math.floor((dd - deg) * 60);
  return { sign: ZODIAC_SIGNS[si], signIdx: si, degInSign: dd, deg, min };
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
    const R  = size / 2 - 14;

    // Parchment background
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R + 14);
    bgGrad.addColorStop(0, "#FDFAF4");
    bgGrad.addColorStop(1, "#EDE8DA");
    ctx.beginPath(); ctx.arc(cx, cy, R + 14, 0, Math.PI * 2);
    ctx.fillStyle = bgGrad; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, R + 12, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(80,60,30,0.15)"; ctx.lineWidth = 2; ctx.stroke();

    const zodOuter = R * 0.97;
    const zodInner = R * 0.75;
    const zodMid   = (zodOuter + zodInner) / 2;

    // ── Zodiac sectors ─────────────────────────────────────
    for (let i = 0; i < 12; i++) {
      const a0   = degToRad(i * 30 - 90);
      const a1   = degToRad((i + 1) * 30 - 90);
      const sign = ZODIAC_SIGNS[i];

      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, zodOuter, a0, a1); ctx.closePath();
      ctx.fillStyle = ELEMENT_BG[sign.element]; ctx.fill();
      ctx.strokeStyle = "rgba(120,100,60,0.15)"; ctx.lineWidth = 0.5; ctx.stroke();

      // Spoke
      ctx.beginPath();
      ctx.moveTo(cx + zodInner * Math.cos(a0), cy + zodInner * Math.sin(a0));
      ctx.lineTo(cx + zodOuter * Math.cos(a0), cy + zodOuter * Math.sin(a0));
      ctx.strokeStyle = "rgba(120,100,60,0.28)"; ctx.lineWidth = 1; ctx.stroke();

      // Degree tick marks within each sign (every 10°)
      for (let d = 10; d < 30; d += 10) {
        const ta = degToRad(i * 30 + d - 90);
        const t0 = zodInner, t1 = zodInner + (zodOuter - zodInner) * 0.25;
        ctx.beginPath();
        ctx.moveTo(cx + t0 * Math.cos(ta), cy + t0 * Math.sin(ta));
        ctx.lineTo(cx + t1 * Math.cos(ta), cy + t1 * Math.sin(ta));
        ctx.strokeStyle = "rgba(120,100,60,0.2)"; ctx.lineWidth = 0.8; ctx.stroke();
      }

      // Zodiac symbol
      const mid = degToRad(i * 30 + 15 - 90);
      ctx.font = `bold ${Math.round(size * 0.042)}px serif`;
      ctx.fillStyle = sign.hue + "CC";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(sign.symbol, cx + zodMid * Math.cos(mid), cy + zodMid * Math.sin(mid));

      // Sign name outside
      ctx.save();
      const nr = zodOuter * 1.055;
      ctx.translate(cx + nr * Math.cos(mid), cy + nr * Math.sin(mid));
      ctx.rotate(mid + Math.PI / 2);
      ctx.font = `${Math.round(size * 0.019)}px Georgia, serif`;
      ctx.fillStyle = "rgba(80,60,30,0.45)";
      ctx.fillText(sign.name, 0, 0);
      ctx.restore();
    }

    // Ring borders
    [zodOuter, zodInner].forEach(r => {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(120,100,60,0.35)"; ctx.lineWidth = 1.5; ctx.stroke();
    });

    // ── Orbit halos (very light filled circles) ───────────
    const usedFracs = [...new Set(PLANETS.map(p => p.orbitFrac))];
    usedFracs.forEach(f => {
      const r = f * zodInner;
      // Light filled band
      ctx.beginPath(); ctx.arc(cx, cy, r + size * 0.018, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(160,130,70,0.04)"; ctx.fill();
      // Dashed orbit ring
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.setLineDash([3, 8]);
      ctx.strokeStyle = "rgba(120,100,60,0.18)"; ctx.lineWidth = 1;
      ctx.stroke(); ctx.setLineDash([]);
    });

    // ── Planets ───────────────────────────────────────────
    PLANETS.forEach((p) => {
      const lon   = positions[p.name] ?? 0;
      const angle = degToRad(lon - 90);
      const orbitR = p.orbitFrac * zodInner;
      const px = cx + orbitR * Math.cos(angle);
      const py = cy + orbitR * Math.sin(angle);
      const isRetro = retrogrades && retrogrades.has(p.name);

      // Radial line Earth→planet (very faint)
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py);
      ctx.strokeStyle = p.color + "28"; ctx.lineWidth = 0.8; ctx.stroke();

      // Glow halo behind planet
      const glowR = size * 0.046;
      const glow = ctx.createRadialGradient(px, py, 0, px, py, glowR);
      glow.addColorStop(0, p.color + "55");
      glow.addColorStop(0.5, p.color + "22");
      glow.addColorStop(1, p.color + "00");
      ctx.beginPath(); ctx.arc(px, py, glowR, 0, Math.PI * 2);
      ctx.fillStyle = glow; ctx.fill();

      // Planet dot
      const dotR = size * 0.020;
      ctx.beginPath(); ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 1.2; ctx.stroke();

      // Compute label position — push outward from Earth for clarity
      const labelDist = dotR + size * 0.016;
      // Angle for label: slightly above the planet away from center
      const lx = px + labelDist * Math.cos(angle);
      const ly = py + labelDist * Math.sin(angle);

      // Short name
      ctx.font = `bold ${Math.round(size * 0.026)}px Georgia, serif`;
      ctx.fillStyle = p.color;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const label = isRetro ? p.short + " ℞" : p.short;
      ctx.fillText(label, lx, ly - size * 0.022);

      // Planet symbol just above the dot
      ctx.font = `${Math.round(size * 0.024)}px serif`;
      ctx.fillStyle = p.color + "CC";
      ctx.fillText(p.symbol, px, py - dotR - size * 0.014);

      // Degrees within sign — draw as tiny arc annotation at orbit edge
      // Small degree label inside the zodiac band at planet's angle
      const { deg, min, degInSign } = signAndDeg(lon);
      const degLabel = `${deg}°${min}'`;
      const degR = zodInner + (zodOuter - zodInner) * 0.5;
      const degX = cx + degR * Math.cos(angle);
      const degY = cy + degR * Math.sin(angle);
      ctx.save();
      ctx.translate(degX, degY);
      ctx.rotate(angle + Math.PI / 2);
      ctx.font = `${Math.round(size * 0.018)}px Georgia, serif`;
      ctx.fillStyle = p.color + "CC";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(degLabel, 0, 0);
      ctx.restore();
    });

    // ── Earth at centre ────────────────────────────────────
    const er = size * 0.052;
    const eg = ctx.createRadialGradient(cx - er * 0.3, cy - er * 0.3, 0, cx, cy, er);
    eg.addColorStop(0, "#6BAED6");
    eg.addColorStop(0.5, "#2166AC");
    eg.addColorStop(1, "#084594");
    ctx.beginPath(); ctx.arc(cx, cy, er, 0, Math.PI * 2);
    ctx.fillStyle = eg; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = `${Math.round(size * 0.026)}px serif`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🜨", cx, cy);

  }, [positions, retrogrades, size]);

  return <canvas ref={canvasRef} style={{ borderRadius: "50%", display: "block" }} />;
}

// ─── Planet Table ─────────────────────────────────────────────────────────────

function PlanetTable({ d1Pos, d9Pos, retrogrades }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "Georgia, serif" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #C8B890" }}>
            {["Planet","","D1 Sign","Deg in Sign","D9 Sign","Deg in Sign"].map((h, i) => (
              <th key={i} style={{
                padding: "7px 10px", textAlign: i === 1 ? "center" : "left",
                color: "#7A6040", fontWeight: "normal", fontSize: 11,
                letterSpacing: 1, textTransform: "uppercase",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PLANETS.map((p, i) => {
            const s1 = signAndDeg(d1Pos[p.name] ?? 0);
            const s9 = signAndDeg(d9Pos[p.name] ?? 0);
            const isRetro = retrogrades && retrogrades.has(p.name);
            return (
              <tr key={p.name} style={{
                background: i % 2 === 0 ? "rgba(200,184,144,0.08)" : "transparent",
                borderBottom: "1px solid rgba(200,184,144,0.2)",
              }}>
                <td style={{ padding: "7px 10px", color: "#3A2A10" }}>
                  <span style={{ fontWeight: "bold" }}>{p.name}</span>
                  {isRetro && <span style={{ color: "#A03030", fontSize: 11, marginLeft: 5 }}>℞</span>}
                </td>
                <td style={{ padding: "7px 4px", textAlign: "center", fontSize: 17, color: p.color }}>{p.symbol}</td>
                <td style={{ padding: "7px 10px" }}>
                  <span style={{ color: s1.sign.hue, marginRight: 4 }}>{s1.sign.symbol}</span>
                  <span style={{ color: "#5A4030" }}>{s1.sign.name}</span>
                </td>
                <td style={{ padding: "7px 10px", color: "#8A7050", fontFamily: "monospace", fontSize: 12 }}>
                  {s1.deg}° {s1.min}′ &nbsp;
                  <span style={{ color: "#B0905A", fontSize: 11 }}>({s1.degInSign.toFixed(2)}°)</span>
                </td>
                <td style={{ padding: "7px 10px" }}>
                  <span style={{ color: s9.sign.hue, marginRight: 4 }}>{s9.sign.symbol}</span>
                  <span style={{ color: "#5A4030" }}>{s9.sign.name}</span>
                </td>
                <td style={{ padding: "7px 10px", color: "#8A7050", fontFamily: "monospace", fontSize: 12 }}>
                  {s9.deg}° {s9.min}′ &nbsp;
                  <span style={{ color: "#B0905A", fontSize: 11 }}>({s9.degInSign.toFixed(2)}°)</span>
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
  const [sliderVal,   setSliderVal]   = useState(0);       // hours offset
  const [rangeDays,   setRangeDays]   = useState(90);
  const [activeChart, setActiveChart] = useState("D1");
  const [playing,     setPlaying]     = useState(false);
  const playRef = useRef(null);
  const containerRef = useRef(null);
  const [chartSize, setChartSize] = useState(400);

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      setChartSize(Math.min(460, Math.max(240, w - 24)));
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

  const effDate = effectiveDate();
  const d1Pos   = computePlanetaryPositions(effDate);
  const retros  = computeRetrogrades(effDate);
  const d9Pos   = {};
  for (const k in d1Pos) d9Pos[k] = toNavamsa(d1Pos[k]);
  const displayPos = activeChart === "D1" ? d1Pos : d9Pos;

  // Play: step 12 hours per tick
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

  // Clamp slider when range changes
  useEffect(() => {
    setSliderVal(v => Math.max(-rangeHours, Math.min(rangeHours, v)));
  }, [rangeHours]);

  const fmtOffset = (hrs) => {
    if (hrs === 0) return "Base time";
    const sign = hrs < 0 ? "−" : "+";
    const abs  = Math.abs(hrs);
    const d    = Math.floor(abs / 24);
    const h    = abs % 24;
    return d > 0 ? `${sign}${d}d ${h}h` : `${sign}${h}h`;
  };

  const effStr = effDate.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  const cardStyle = {
    background: "#FDFAF4", border: "1px solid #D8CCAA", borderRadius: 14,
    padding: "16px 20px", marginBottom: 14,
    boxShadow: "0 2px 8px rgba(120,90,40,0.07)",
  };
  const btnBase = {
    padding: "7px 16px", borderRadius: 7, cursor: "pointer",
    fontFamily: "Georgia, serif", fontSize: 12,
    border: "1.5px solid #C8B890", transition: "all 0.15s",
  };
  const btnActive = { ...btnBase, background: "#7A6040", color: "#FFF7E6", borderColor: "#7A6040" };
  const btnGhost  = { ...btnBase, background: "transparent", color: "#7A6040" };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #F5F0E4 0%, #EDE4CC 100%)",
      fontFamily: "Georgia, 'Times New Roman', serif",
      color: "#3A2E18", padding: "20px 12px 48px",
    }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 10, letterSpacing: 5, color: "#A08040", textTransform: "uppercase", marginBottom: 4 }}>
            Jyotish · Vedic Astrology
          </div>
          <h1 style={{ margin: 0, fontWeight: "normal", letterSpacing: 2, fontSize: "clamp(20px,5vw,32px)", color: "#4A3010" }}>
            Geocentric Chart Viewer
          </h1>
          <div style={{ color: "#A09060", fontSize: 12, marginTop: 4 }}>
            Lahiri Ayanamsa · Sidereal · Earth as Centre
          </div>
        </div>

        {/* Datetime */}
        <div style={cardStyle}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "#A08040", marginBottom: 10, textTransform: "uppercase" }}>
            Birth / Reference Date & Time
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input type="datetime-local" value={baseDate}
              onChange={e => { setBaseDate(e.target.value); setSliderVal(0); }}
              style={{
                padding: "8px 12px", borderRadius: 8, border: "1.5px solid #C8B890",
                background: "#FFF8EE", color: "#4A3010", fontFamily: "Georgia, serif",
                fontSize: 13, outline: "none", flex: 1, minWidth: 200,
              }}
            />
            <button onClick={() => { setBaseDate(toLocal(new Date())); setSliderVal(0); }} style={{ ...btnGhost, padding: "8px 14px" }}>
              Now
            </button>
          </div>
        </div>

        {/* Time Slider */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: "#A08040", textTransform: "uppercase" }}>
              Time Slider
            </div>
            <div style={{ fontSize: 12, color: "#7A6040", fontStyle: "italic" }}>
              {effStr} &nbsp;·&nbsp; <span style={{ color: sliderVal !== 0 ? "#8A3010" : "#7A6040" }}>{fmtOffset(sliderVal)}</span>
            </div>
          </div>

          {/* Range selector */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "#A08040", alignSelf: "center", marginRight: 4 }}>Range:</span>
            {RANGE_OPTIONS.map(opt => (
              <button key={opt.days} onClick={() => setRangeDays(opt.days)}
                style={rangeDays === opt.days ? { ...btnActive, padding: "4px 12px", fontSize: 11 } : { ...btnGhost, padding: "4px 12px", fontSize: 11 }}>
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#A08060", whiteSpace: "nowrap" }}>−{rangeDays}d</span>
            <input type="range" min={-rangeHours} max={rangeHours} step={6}
              value={sliderVal}
              onChange={e => setSliderVal(Number(e.target.value))}
              style={{ flex: 1, accentColor: "#8A6030" }}
            />
            <span style={{ fontSize: 11, color: "#A08060", whiteSpace: "nowrap" }}>+{rangeDays}d</span>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => { setSliderVal(0); setPlaying(false); }} style={{ ...btnGhost, fontSize: 11, padding: "5px 12px" }}>
              Reset
            </button>
            <button onClick={() => setPlaying(p => !p)}
              style={playing ? { ...btnActive, fontSize: 11, padding: "5px 14px" } : { ...btnGhost, fontSize: 11, padding: "5px 14px" }}>
              {playing ? "⏸ Pause" : "▶ Play forward"}
            </button>
          </div>
        </div>

        {/* D1/D9 Toggle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <div style={{ border: "1.5px solid #C8B890", borderRadius: 10, overflow: "hidden", display: "inline-flex" }}>
            {["D1","D9"].map(c => (
              <button key={c} onClick={() => setActiveChart(c)} style={{
                padding: "10px 40px", background: activeChart === c ? "#7A6040" : "transparent",
                border: "none", cursor: "pointer",
                color: activeChart === c ? "#FFF7E6" : "#7A6040",
                fontFamily: "Georgia, serif", fontSize: 14, letterSpacing: 2,
              }}>
                {c}
                <span style={{ fontSize: 10, display: "block", letterSpacing: 1, opacity: 0.7, marginTop: 1 }}>
                  {c === "D1" ? "Rasi" : "Navamsa"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div ref={containerRef} style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div style={{
            padding: 10, borderRadius: "50%", background: "#FDFAF4",
            boxShadow: "0 4px 24px rgba(120,90,40,0.15), 0 1px 4px rgba(120,90,40,0.1)",
          }}>
            <VedicChartCanvas positions={displayPos} retrogrades={retros} size={chartSize} />
          </div>
        </div>

        {/* Retrograde note */}
        {retros.size > 0 && (
          <div style={{ textAlign: "center", marginBottom: 12, fontSize: 12, color: "#A03030" }}>
            ℞ Retrograde: {[...retros].join(", ")}
          </div>
        )}

        {/* Table */}
        <div style={cardStyle}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "#A08040", marginBottom: 12, textTransform: "uppercase" }}>
            Planetary Positions · Degrees within Sign (0°–30°)
          </div>
          <PlanetTable d1Pos={d1Pos} d9Pos={d9Pos} retrogrades={retros} />
        </div>

        <div style={{ textAlign: "center", color: "#B0965A", fontSize: 11, letterSpacing: 1, lineHeight: 1.8 }}>
          Positions computed using mean orbital elements with Lahiri ayanamsa.<br/>
          For precise Jyotish work, verify with dedicated ephemeris software.
        </div>
      </div>
    </div>
  );
}
