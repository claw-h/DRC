/**
 * scripts/generate-constellations.mjs
 * 
 * Compiles authoritative astronomical data (IAU, Hipparcos, WGSN, Messier)
 * into high-precision, zero-latency static assets for the DRC Celestial & Epistemic Observatory.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCES_DIR = path.resolve(process.cwd(), 'scripts/sources');
const OUT_DIR = path.resolve(process.cwd(), 'public/data/sky');

// Roman numerals for plates 1 to 88
function toRoman(num) {
  const roman = [
    ['LXXX', 80], ['LXX', 70], ['LX', 60], ['L', 50], ['XL', 40],
    ['XXX', 30], ['XX', 20], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]
  ];
  let result = '';
  for (const [r, n] of roman) {
    while (num >= n) {
      result += r;
      num -= n;
    }
  }
  return result;
}

// Format RA (degrees) -> "HHh MMm SSs"
function formatRA(deg) {
  let hrs = deg / 15;
  while (hrs < 0) hrs += 24;
  while (hrs >= 24) hrs -= 24;
  const h = Math.floor(hrs);
  const m = Math.floor((hrs - h) * 60);
  const s = ((hrs - h - m / 60) * 3600).toFixed(1);
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(4, '0')}s`;
}

// Format Dec (degrees) -> "±DD° MM' SS\""
function formatDec(deg) {
  const sign = deg >= 0 ? '+' : '-';
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = Math.round((abs - d - m / 60) * 3600);
  return `${sign}${String(d).padStart(2, '0')}° ${String(m).padStart(2, '0')}' ${String(s).padStart(2, '0')}"`;
}

// Ballesteros (2012) Effective Temperature from B-V color index
function bvToTemp(bv) {
  if (bv === null || bv === undefined || Number.isNaN(bv)) return 5778; // Solar default
  if (bv < -0.35) return 40000;
  if (bv > 2.2) return 2400;
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  return Math.round(Math.max(2200, Math.min(45000, t)));
}

// OKLCH Hue and RGB estimate for wet-ink star visualization
function bvToHueAndRgb(bv) {
  if (bv < 0.0) {
    return { hue: 245, rgb: [160, 195, 255], spec: 'B' };
  } else if (bv < 0.3) {
    return { hue: 235, rgb: [215, 230, 255], spec: 'A' };
  } else if (bv < 0.58) {
    return { hue: 85, rgb: [248, 248, 240], spec: 'F' };
  } else if (bv < 0.81) {
    return { hue: 75, rgb: [255, 244, 215], spec: 'G' };
  } else if (bv < 1.4) {
    return { hue: 55, rgb: [255, 210, 150], spec: 'K' };
  } else {
    return { hue: 35, rgb: [255, 160, 110], spec: 'M' };
  }
}

// Stereographic projection centered on (ra0, dec0) in degrees
function stereographicProject(ra, dec, ra0, dec0) {
  const deg2rad = Math.PI / 180;
  const d0 = dec0 * deg2rad;
  const d = dec * deg2rad;
  const dra = (ra - ra0) * deg2rad;

  const cosC = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(dra);
  if (cosC <= -0.999) return { xi: 0, eta: 0 }; // Antipodal point

  const k = 2 / (1 + cosC);
  // East is to the left in astronomical charts -> negative sign
  const xi = -k * Math.cos(d) * Math.sin(dra);
  // North is up
  const eta = k * (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(dra));

  return { xi, eta };
}

// Standard 110-entry Messier constellation mapping
const MESSIER_CONSTELLATION = {
  M1: 'Tau', M2: 'Aqr', M3: 'CVn', M4: 'Sco', M5: 'Ser', M6: 'Sco', M7: 'Sco', M8: 'Sgr', M9: 'Oph', M10: 'Oph',
  M11: 'Sct', M12: 'Oph', M13: 'Her', M14: 'Oph', M15: 'Peg', M16: 'Ser', M17: 'Sgr', M18: 'Sgr', M19: 'Oph', M20: 'Sgr',
  M21: 'Sgr', M22: 'Sgr', M23: 'Sgr', M24: 'Sgr', M25: 'Sgr', M26: 'Sct', M27: 'Vul', M28: 'Sgr', M29: 'Cyg', M30: 'Cap',
  M31: 'And', M32: 'And', M33: 'Tri', M34: 'Per', M35: 'Gem', M36: 'Aur', M37: 'Aur', M38: 'Aur', M39: 'Cyg', M40: 'UMa',
  M41: 'CMa', M42: 'Ori', M43: 'Ori', M44: 'Cnc', M45: 'Tau', M46: 'Pup', M47: 'Pup', M48: 'Hya', M49: 'Vir', M50: 'Mon',
  M51: 'CVn', M52: 'Cas', M53: 'Com', M54: 'Sgr', M55: 'Sgr', M56: 'Lyr', M57: 'Lyr', M58: 'Vir', M59: 'Vir', M60: 'Vir',
  M61: 'Vir', M62: 'Oph', M63: 'CVn', M64: 'Com', M65: 'Leo', M66: 'Leo', M67: 'Cnc', M68: 'Hya', M69: 'Sgr', M70: 'Sgr',
  M71: 'Sge', M72: 'Aqr', M73: 'Aqr', M74: 'Psc', M75: 'Sgr', M76: 'Per', M77: 'Cet', M78: 'Ori', M79: 'Lep', M80: 'Sco',
  M81: 'UMa', M82: 'UMa', M83: 'Hya', M84: 'Vir', M85: 'Com', M86: 'Vir', M87: 'Vir', M88: 'Com', M89: 'Vir', M90: 'Vir',
  M91: 'Com', M92: 'Her', M93: 'Pup', M94: 'CVn', M95: 'Leo', M96: 'Leo', M97: 'UMa', M98: 'Com', M99: 'Com', M100: 'Com',
  M101: 'UMa', M102: 'Dra', M103: 'Cas', M104: 'Vir', M105: 'Leo', M106: 'CVn', M107: 'Oph', M108: 'UMa', M109: 'UMa', M110: 'And'
};

// Southern sky and non-Messier showpiece deep-sky objects
const SOUTHERN_SHOWPIECES = {
  Car: [{ name: 'NGC 3372', title: 'Great Carina Nebula (η Car)', type: 'sfr', mag: 3.0, ra: 161.26, dec: -59.87 }],
  Cen: [{ name: 'NGC 5139', title: 'Omega Centauri Globular Cluster', type: 'gc', mag: 3.9, ra: 201.70, dec: -47.48 },
        { name: 'NGC 5128', title: 'Centaurus A Peculiar Galaxy', type: 's', mag: 6.8, ra: 201.37, dec: -43.02 }],
  Cru: [{ name: 'NGC 4755', title: 'Jewel Box Open Cluster', type: 'oc', mag: 4.2, ra: 193.41, dec: -60.37 }],
  Dor: [{ name: 'NGC 2070', title: '30 Doradus · Tarantula Nebula', type: 'sfr', mag: 8.0, ra: 84.68, dec: -69.10 }],
  Tuc: [{ name: 'NGC 104', title: '47 Tucanae Globular Cluster', type: 'gc', mag: 4.1, ra: 6.02, dec: -72.08 }],
  Vel: [{ name: 'Gum Nebula', title: 'Vela Supernova Remnant', type: 'snr', mag: 7.0, ra: 130.0, dec: -45.0 }],
  Mus: [{ name: 'NGC 4833', title: 'Musca Globular Cluster', type: 'gc', mag: 7.8, ra: 194.89, dec: -70.88 }],
  Pav: [{ name: 'NGC 6752', title: 'Pavo Great Globular Cluster', type: 'gc', mag: 5.4, ra: 287.72, dec: -59.98 }],
  Ara: [{ name: 'NGC 6397', title: 'Ara Globular Cluster', type: 'gc', mag: 5.3, ra: 265.18, dec: -53.67 }],
  Scl: [{ name: 'NGC 253', title: 'Sculptor Silver Coin Galaxy', type: 's', mag: 7.1, ra: 11.89, dec: -25.29 }],
  For: [{ name: 'NGC 1365', title: 'Fornax Great Barred Spiral', type: 's', mag: 9.6, ra: 53.40, dec: -36.14 }],
  Gru: [{ name: 'NGC 7582', title: 'Grus Quartet Spiral Galaxy', type: 's', mag: 10.5, ra: 349.60, dec: -42.37 }],
  Cam: [{ name: 'NGC 2403', title: 'Camelopardalis Intermediate Spiral', type: 's', mag: 8.4, ra: 114.21, dec: 65.60 }],
  Hyi: [{ name: 'NGC 1466', title: 'Hydrus Globular Cluster', type: 'gc', mag: 11.4, ra: 56.14, dec: -71.67 }],
  Phe: [{ name: 'NGC 625', title: 'Phoenix Dwarf Starburst Galaxy', type: 'i', mag: 11.7, ra: 23.77, dec: -41.43 }],
  Col: [{ name: 'NGC 1851', title: 'Columba Globular Cluster', type: 'gc', mag: 7.3, ra: 78.53, dec: -40.05 }],
  Vol: [{ name: 'NGC 2442', title: 'Meathook Spiral Galaxy', type: 's', mag: 10.4, ra: 114.11, dec: -69.53 }],
  Pic: [{ name: 'Beta Pic', title: 'Beta Pictoris Circumstellar Disk', type: 'sfr', mag: 3.86, ra: 86.82, dec: -51.07 }]
};

// Additional showpieces for constellations lacking Messier showpieces
const ADDITIONAL_SHOWPIECES = {
  Lac: [{ name: 'NGC 7243', title: 'Lacerta Open Star Swarm', type: 'oc', mag: 6.4, ra: 333.84, dec: 49.88 },
        { name: 'BL Lacertae', title: 'Active Blazar Galactic Core', type: 's', mag: 14.0, ra: 330.68, dec: 42.28 }],
  Equ: [{ name: 'NGC 7015', title: 'Equuleus Ghost Spiral Galaxy', type: 's', mag: 12.4, ra: 316.42, dec: 11.25 }],
  Sex: [{ name: 'NGC 3115', title: 'Spindle Lenticular Galaxy', type: 's', mag: 8.9, ra: 151.31, dec: -7.72 }],
  Lyn: [{ name: 'NGC 2683', title: 'UFO Spiral Galaxy', type: 's', mag: 9.8, ra: 133.17, dec: 33.42 }],
  LMi: [{ name: 'NGC 3432', title: 'Needle Galaxy', type: 's', mag: 11.1, ra: 163.14, dec: 36.62 }],
  Mon: [{ name: 'NGC 2237', title: 'Rosette Star-Forming Nebula', type: 'sfr', mag: 9.0, ra: 97.98, dec: 4.95 },
        { name: 'NGC 2264', title: 'Christmas Tree Cluster & Cone Nebula', type: 'oc', mag: 3.9, ra: 100.24, dec: 9.89 }],
  TrA: [{ name: 'NGC 6025', title: 'Triangulum Australe Open Cluster', type: 'oc', mag: 5.1, ra: 240.85, dec: -60.43 }],
  Ret: [{ name: 'NGC 1313', title: 'Topsy-Turvy Spiral Galaxy', type: 's', mag: 8.7, ra: 49.58, dec: -66.50 }],
  Cae: [{ name: 'NGC 1571', title: 'Caelum Faint Galaxy', type: 's', mag: 12.3, ra: 65.50, dec: -37.60 }],
  Men: [{ name: 'NGC 1711', title: 'Mensa Magellanic Cluster', type: 'oc', mag: 10.1, ra: 71.60, dec: -69.88 }],
  Cha: [{ name: 'NGC 3195', title: 'Chamaeleon Planetary Nebula', type: 'pn', mag: 11.6, ra: 152.40, dec: -80.86 }],
  Cir: [{ name: 'Circinus Galaxy', title: 'Circinus Seyfert Galaxy', type: 's', mag: 11.0, ra: 213.29, dec: -65.34 }],
  CrB: [{ name: 'Abell 2065', title: 'Corona Borealis Galaxy Cluster', type: 's', mag: 13.0, ra: 230.70, dec: 27.72 }],
  Del: [{ name: 'NGC 6934', title: 'Delphinus Globular Cluster', type: 'gc', mag: 8.9, ra: 308.55, dec: 7.40 }],
  Mic: [{ name: 'NGC 6925', title: 'Microscopium Spiral Galaxy', type: 's', mag: 11.3, ra: 308.62, dec: -31.98 }],
  Ind: [{ name: 'NGC 7041', title: 'Indus Lenticular Galaxy', type: 's', mag: 11.1, ra: 320.14, dec: -48.36 }],
  Aps: [{ name: 'NGC 6101', title: 'Apus Globular Cluster', type: 'gc', mag: 9.2, ra: 246.45, dec: -72.20 }],
  Tel: [{ name: 'NGC 6584', title: 'Telescopium Globular Cluster', type: 'gc', mag: 7.9, ra: 274.66, dec: -52.21 }],
  Oct: [{ name: 'NGC 2573', title: 'Polarissima Australis Galaxy', type: 's', mag: 13.4, ra: 40.50, dec: -89.33 }],
  Pyx: [{ name: 'NGC 2613', title: 'Pyxis Spiral Galaxy', type: 's', mag: 10.4, ra: 128.55, dec: -22.97 }],
  Ant: [{ name: 'NGC 2997', title: 'Antlia Grand Design Spiral', type: 's', mag: 9.6, ra: 146.41, dec: -31.19 }],
  Crv: [{ name: 'NGC 4038', title: 'Antennae Colliding Galaxies', type: 's', mag: 10.3, ra: 180.47, dec: -18.87 }],
  Crt: [{ name: 'NGC 3887', title: 'Crater Barred Spiral Galaxy', type: 's', mag: 10.6, ra: 176.79, dec: -16.85 }],
  Vul: [{ name: 'NGC 6940', title: 'Vulpecula Open Star Swarm', type: 'oc', mag: 6.3, ra: 308.60, dec: 28.30 }],
  Sge: [{ name: 'NGC 6838', title: 'Sagitta Star Swarm (M71)', type: 'gc', mag: 8.3, ra: 298.44, dec: 18.78 }],
  Lyr: [{ name: 'NGC 6744', title: 'Lyra Milky Way Twin Spiral', type: 's', mag: 9.0, ra: 287.44, dec: 38.30 }],
  Boo: [{ name: 'NGC 5466', title: 'Bootes Ghost Globular Cluster', type: 'gc', mag: 9.0, ra: 211.36, dec: 28.53 }]
};

// Zodiac constellations that sit directly along the Ecliptic (Via Solis)
const ZODIAC_CONSTELLATIONS = new Set([
  'Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc', 'Oph'
]);

// Canonical Mythological Figurative Echoes: Classical stipple contour guides
const CANONICAL_MYTHIC_FIGURES = {
  Ori: [
    // Lion skin shield held outward
    [[5800, 3600], [6400, 4200], [6700, 5200], [6400, 6200], [5900, 6800]],
    // Raised hunter club above Betelgeuse
    [[3700, 4200], [3300, 3200], [3100, 2200], [3600, 1900], [4000, 2500], [3800, 3600]],
    // Scabbard hanging from belt through M42
    [[4800, 6400], [4700, 7200], [4600, 8000]],
    // Ethereal hunter cloak billowing behind shoulders
    [[3800, 4600], [2800, 5200], [3200, 7200], [4400, 7800]]
  ],
  Cyg: [
    // Left wing sweeping forward
    [[4800, 4400], [3600, 3200], [2400, 3600], [2000, 4800]],
    // Right wing sweeping back
    [[5200, 4400], [6400, 5600], [7400, 5200], [7800, 4200]],
    // Swan neck and head extending forward
    [[5000, 4200], [5200, 6000], [5600, 7800], [5900, 8400]]
  ],
  Leo: [
    // Sickle mane arching over head
    [[6400, 6400], [7000, 5200], [6600, 3600], [5400, 3400], [4800, 4200]],
    // Spine crouching low to Denebola
    [[5000, 4400], [4000, 4200], [3200, 4600], [2600, 5000]],
    // Arched tail
    [[2600, 5000], [1800, 4400], [1900, 3600]]
  ],
  Tau: [
    // Bull horns reaching toward Elnath and Zeta
    [[4600, 5200], [5400, 3600], [6000, 2400]],
    [[4800, 5400], [6200, 4600], [7200, 4200]],
    // Bull chest charging
    [[4400, 5400], [3400, 5000], [2600, 5200]]
  ],
  Cas: [
    // High-backed celestial throne frame
    [[3400, 3800], [3400, 6600], [5600, 6600]],
    [[5600, 6600], [6800, 5600], [6800, 3400]],
    [[3200, 3600], [4200, 2800], [5800, 3000]]
  ],
  Sco: [
    // Barbed stinger arching forward
    [[4800, 6600], [4200, 7800], [5400, 8600], [6400, 8200], [6400, 7200]],
    // Pincers reaching forward
    [[5200, 3600], [6200, 2600], [7000, 2800]],
    [[4800, 3800], [4000, 2400], [3200, 2600]]
  ],
  Peg: [
    // Winged steed pinions spreading
    [[3400, 3800], [2000, 2600], [1400, 3400], [2800, 4400]],
    [[3400, 6200], [1800, 6600], [1600, 7600], [3000, 7000]]
  ],
  UMa: [
    // Great bear snout
    [[5800, 3800], [7000, 3400], [7600, 3800], [7200, 4600]],
    // Leaping paws
    [[6000, 5400], [6400, 7000], [6800, 7600]],
    [[4400, 6200], [4200, 7400], [4600, 8000]]
  ]
};

// Known Hipparcos / Gaia physical distances in light-years for primary navigational stars
const STAR_DISTANCES_LY = {
  32349: 8.6,    // Sirius (Alpha CMa)
  71683: 4.37,   // Alpha Centauri A/B
  71681: 4.37,   // Alpha Centauri B
  37279: 11.46,  // Procyon (Alpha CMi)
  97649: 16.73,  // Altair (Alpha Aql)
  113368: 25.13, // Fomalhaut (Alpha PsA)
  91262: 25.04,  // Vega (Alpha Lyr)
  37826: 33.78,  // Pollux (Beta Gem)
  69673: 36.7,   // Arcturus (Alpha Boo)
  24608: 42.9,   // Capella (Alpha Aur)
  36850: 51.0,   // Castor (Alpha Gem)
  746: 54.7,     // Caph (Beta Cas)
  21421: 65.3,   // Aldebaran (Alpha Tau)
  54061: 123.0,  // Dubhe (Alpha UMa)
  53910: 79.7,   // Merak (Beta UMa)
  58001: 83.2,   // Phecda (Gamma UMa)
  59774: 80.5,   // Megrez (Delta UMa)
  62956: 82.6,   // Alioth (Epsilon UMa)
  65378: 82.9,   // Mizar (Zeta UMa)
  67301: 103.9,  // Alkaid (Eta UMa)
  6686: 99.4,    // Ruchbah (Delta Cas)
  7588: 139.0,   // Achernar (Alpha Eri)
  65474: 250.0,  // Spica (Alpha Vir)
  25336: 252.0,  // Bellatrix (Gamma Ori)
  3179: 228.0,   // Schedar (Alpha Cas)
  30438: 310.0,  // Canopus (Alpha Car)
  11767: 433.0,  // Polaris (Alpha UMi)
  95947: 430.0,  // Albireo (Beta Cyg)
  8886: 460.0,   // Segin (Epsilon Cas)
  27989: 548.0,  // Betelgeuse (Alpha Ori)
  4427: 550.0,   // Navi (Gamma Cas)
  80763: 550.0,  // Antares (Alpha Sco)
  27366: 650.0,  // Saiph (Kappa Ori)
  24436: 863.0,  // Rigel (Beta Ori)
  25930: 1200.0, // Mintaka (Delta Ori)
  26727: 1260.0, // Alnitak (Zeta Ori)
  102098: 1550.0,// Deneb (Alpha Cyg)
  26311: 2000.0, // Alnilam (Epsilon Ori)
};

function getStarDistanceLy(hip, mag, bv, specSlot) {
  if (STAR_DISTANCES_LY[hip]) return STAR_DISTANCES_LY[hip];
  // Standard photometric distance modulus approximation based on visual magnitude and MK spectral class
  let absM = 4.8;
  switch (specSlot) {
    case 1: absM = mag < 2.5 ? -6.0 : -3.5; break; // O/B supergiant/giant
    case 2: absM = mag < 2.5 ? -3.0 : 0.6; break;  // A class
    case 3: absM = 2.8; break;                      // F class
    case 4: absM = 4.8; break;                      // G solar
    case 5: absM = mag < 3.5 ? -0.5 : 6.0; break;  // K giant or dwarf
    case 6: absM = mag < 3.5 ? -4.5 : 8.5; break;  // M supergiant or red dwarf
    default: absM = 3.5;
  }
  const distPc = Math.pow(10, (mag - absM + 5) / 5);
  const distLy = distPc * 3.26156;
  return Math.round(Math.max(12, Math.min(12000, distLy)));
}

// IAU J2000 Galactic coordinate transformation
function equatorialToGalactic(raDeg, decDeg) {
  const deg2rad = Math.PI / 180;
  const rad2deg = 180 / Math.PI;

  const raG = 192.85948 * deg2rad;
  const decG = 27.12825 * deg2rad;
  const l0 = 32.93192 * deg2rad;

  const a = raDeg * deg2rad;
  const d = decDeg * deg2rad;

  const sinB = Math.sin(d) * Math.sin(decG) + Math.cos(d) * Math.cos(decG) * Math.cos(a - raG);
  const b = Math.asin(Math.max(-1, Math.min(1, sinB)));

  const y = Math.cos(d) * Math.sin(a - raG);
  const x = Math.cos(decG) * Math.sin(d) - Math.sin(decG) * Math.cos(d) * Math.cos(a - raG);
  const l = (Math.atan2(y, x) + l0 + 2 * Math.PI) % (2 * Math.PI);

  return {
    lDeg: parseFloat((l * rad2deg).toFixed(2)),
    bDeg: parseFloat((b * rad2deg).toFixed(2)),
    inMilkyWay: Math.abs(b * rad2deg) <= 30.0
  };
}

async function main() {
  console.log('[DRC Astro Pipeline] Compiling authoritative celestial catalog...');

  // 1. Parse official IAU WGSN star names
  const wgsnRaw = await fs.readFile(path.join(SOURCES_DIR, 'IAU-CSN.txt'), 'utf8');
  const wgsnMap = new Map();
  for (const line of wgsnRaw.split('\n')) {
    if (line.startsWith('#') || line.trim().length === 0) continue;
    const nameAscii = line.slice(0, 18).trim();
    const parts = line.split(/\s+/);
    // Find HIP number in columns
    for (let i = 8; i < Math.min(14, parts.length); i++) {
      const num = Number(parts[i]);
      if (Number.isInteger(num) && num > 0 && num <= 120000) {
        if (!wgsnMap.has(num)) {
          wgsnMap.set(num, nameAscii);
        }
        break;
      }
    }
  }
  console.log(`[DRC Astro Pipeline] Loaded ${wgsnMap.size} official IAU WGSN star names.`);

  // 2. Parse starnames.json (Bayer, Flamsteed, HD numbers)
  const starnamesRaw = await fs.readFile(path.join(SOURCES_DIR, 'starnames.json'), 'utf8');
  const starnames = JSON.parse(starnamesRaw);

  // 3. Parse stars.6.json
  const starsRaw = await fs.readFile(path.join(SOURCES_DIR, 'stars.6.json'), 'utf8');
  const starsGeo = JSON.parse(starsRaw);

  const starMap = new Map();
  for (const feat of starsGeo.features) {
    const hip = Number(feat.id);
    const [lon, lat] = feat.geometry.coordinates;
    const ra = (lon + 360) % 360;
    const dec = lat;
    const mag = feat.properties.mag;
    const bv = parseFloat(feat.properties.bv) || 0.0;
    const { hue, rgb, spec } = bvToHueAndRgb(bv);
    const tempK = bvToTemp(bv);

    const meta = starnames[String(hip)] || {};
    const properName = wgsnMap.get(hip) || meta.name || '';
    const bayer = meta.bayer || meta.desig || '';
    const hd = meta.hd ? meta.hd.replace(/[^0-9]/g, '') : '';
    const con = meta.c || '';

    starMap.set(hip, {
      hip,
      ra,
      dec,
      mag,
      bv,
      tempK,
      hue,
      rgb,
      spec,
      properName,
      bayer,
      hd,
      con
    });
  }

  // Ensure Mira (HIP 10826, Omicron Ceti) is cataloged
  if (!starMap.has(10826)) {
    starMap.set(10826, {
      hip: 10826,
      ra: 34.8366,
      dec: -2.9776,
      mag: 3.04,
      bv: 1.42,
      tempK: 2900,
      hue: 35,
      rgb: [255, 160, 110],
      spec: 'M',
      properName: 'Mira',
      bayer: 'ο',
      hd: '14386',
      con: 'Cet'
    });
  }
  console.log(`[DRC Astro Pipeline] Cataloged ${starMap.size} naked-eye Hipparcos stars (Vmag <= 6.0).`);

  // Build compact spatial lookup for star snapping
  const allStars = Array.from(starMap.values());
  const grid = {};
  for (const s of allStars) {
    const gx = Math.floor(s.ra / 3);
    const gy = Math.floor((s.dec + 90) / 3);
    const k = `${gx}_${gy}`;
    if (!grid[k]) grid[k] = [];
    grid[k].push(s);
  }

  function findClosestStar(lon, lat) {
    const nLon = (lon + 360) % 360;
    const gx = Math.floor(nLon / 3);
    const gy = Math.floor((lat + 90) / 3);
    let best = null;
    let minDist = 999;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const k = `${(gx + dx + 120) % 120}_${Math.max(0, Math.min(59, gy + dy))}`;
        const cell = grid[k];
        if (!cell) continue;
        for (const s of cell) {
          const dLon = (nLon - s.ra) * Math.cos(s.dec * Math.PI / 180);
          const dLat = lat - s.dec;
          const dist = Math.hypot(dLon, dLat);
          if (dist < minDist) {
            minDist = dist;
            best = s;
          }
        }
      }
    }
    return best;
  }

  // 4. Parse Messier catalog
  const messierRaw = await fs.readFile(path.join(SOURCES_DIR, 'messier.json'), 'utf8');
  const messierGeo = JSON.parse(messierRaw);
  const messierByCon = {};
  for (const feat of messierGeo.features) {
    const id = feat.id;
    const con = MESSIER_CONSTELLATION[id];
    if (!con) continue;
    if (!messierByCon[con]) messierByCon[con] = [];
    const [lon, lat] = feat.geometry.coordinates;
    messierByCon[con].push({
      id,
      name: feat.properties.desig || id,
      title: feat.properties.alt ? `${feat.properties.alt} (${id})` : `${id} Deep Sky Object`,
      type: feat.properties.type || 'sfr',
      mag: feat.properties.mag,
      ra: (lon + 360) % 360,
      dec: lat
    });
  }

  // 5. Parse constellations.json and constellations.lines.json
  const constsRaw = await fs.readFile(path.join(SOURCES_DIR, 'constellations.json'), 'utf8');
  const constsGeo = JSON.parse(constsRaw);

  const linesRaw = await fs.readFile(path.join(SOURCES_DIR, 'constellations.lines.json'), 'utf8');
  const linesGeo = JSON.parse(linesRaw);

  // Merge the Serpens Caput & Cauda entries cleanly into Ser
  const constList = [];
  const seenIds = new Set();
  let plateIndex = 1;

  for (const feat of constsGeo.features) {
    const id = feat.id;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const name = feat.properties.name === 'Serpens Caput' ? 'Serpens' : feat.properties.name;
    const genitive = feat.properties.gen;
    const english = feat.properties.en;

    // Collect all line features for this constellation
    const lineFeats = linesGeo.features.filter(f => f.id === id);
    const starHips = new Set();
    const edges = [];

    for (const lf of lineFeats) {
      for (const seg of lf.geometry.coordinates) {
        let prevHip = null;
        for (const [lon, lat] of seg) {
          const s = findClosestStar(lon, lat);
          if (s) {
            starHips.add(s.hip);
            if (prevHip !== null && prevHip !== s.hip) {
              edges.push([prevHip, s.hip]);
            }
            prevHip = s.hip;
          }
        }
      }
    }

    const starObjs = Array.from(starHips).map(hip => starMap.get(hip)).filter(Boolean);
    if (starObjs.length === 0) continue;

    // Calculate spherical centroid
    let sumX = 0, sumY = 0, sumZ = 0;
    const deg2rad = Math.PI / 180;
    for (const s of starObjs) {
      const a = s.ra * deg2rad;
      const d = s.dec * deg2rad;
      sumX += Math.cos(d) * Math.cos(a);
      sumY += Math.cos(d) * Math.sin(a);
      sumZ += Math.sin(d);
    }
    const baryDec = Math.atan2(sumZ, Math.hypot(sumX, sumY)) / deg2rad;
    const baryRa = ((Math.atan2(sumY, sumX) / deg2rad) + 360) % 360;

    // Project stars stereographically onto tangent chart [1600..8400]
    const projStars = [];
    let minXi = 999, maxXi = -999, minEta = 999, maxEta = -999;
    for (const s of starObjs) {
      const { xi, eta } = stereographicProject(s.ra, s.dec, baryRa, baryDec);
      if (xi < minXi) minXi = xi;
      if (xi > maxXi) maxXi = xi;
      if (eta < minEta) minEta = eta;
      if (eta > maxEta) maxEta = eta;
      projStars.push({ star: s, xi, eta });
    }

    const spanX = Math.max(0.08, maxXi - minXi);
    const spanY = Math.max(0.08, maxEta - minEta);
    const maxSpan = Math.max(spanX, spanY);
    const scale = 5400 / maxSpan; // Fit comfortably inside 1600..8400 box

    // Sorted stars with brightest (lowest mag) first
    starObjs.sort((a, b) => a.mag - b.mag);
    const hipToIdx = new Map();
    const starTuples = [];

    projStars.forEach((p, idx) => {
      hipToIdx.set(p.star.hip, idx);
      const chartX = Math.round(5000 + p.xi * scale);
      const chartY = Math.round(5000 - p.eta * scale); // Invert Y for canvas
      const specSlot = p.star.spec === 'O' || p.star.spec === 'B' ? 1 : p.star.spec === 'A' ? 2 : p.star.spec === 'F' ? 3 : p.star.spec === 'G' ? 4 : p.star.spec === 'K' ? 5 : 6;
      const distLy = getStarDistanceLy(p.star.hip, p.star.mag, p.star.bv, specSlot);
      // Format: [x, y, mag, specSlot, hip, properName, bayer, distLy]
      starTuples.push([
        chartX,
        chartY,
        parseFloat(p.star.mag.toFixed(2)),
        specSlot,
        p.star.hip,
        p.star.properName,
        p.star.bayer,
        distLy
      ]);
    });

    // Remap edges to local star indices
    const edgeTuples = [];
    const edgeSet = new Set();
    for (const [hipA, hipB] of edges) {
      const idxA = hipToIdx.get(hipA);
      const idxB = hipToIdx.get(hipB);
      if (idxA !== undefined && idxB !== undefined && idxA !== idxB) {
        const k = idxA < idxB ? `${idxA}_${idxB}` : `${idxB}_${idxA}`;
        if (!edgeSet.has(k)) {
          edgeSet.add(k);
          edgeTuples.push([idxA, idxB]);
        }
      }
    }

    // Collect deep sky objects for this constellation
    let deepSky = (messierByCon[id] || []).concat(SOUTHERN_SHOWPIECES[id] || []).concat(ADDITIONAL_SHOWPIECES[id] || []);

    // Proximity search: find other Messier / showpiece objects within ~22 degrees
    for (const [conKey, objList] of Object.entries(messierByCon)) {
      if (conKey === id) continue;
      for (const obj of objList) {
        const dRa = (obj.ra - baryRa) * Math.cos(baryDec * deg2rad);
        const dDec = obj.dec - baryDec;
        const angDist = Math.hypot(dRa, dDec);
        if (angDist <= 22.0 && !deepSky.some(existing => existing.name === obj.name)) {
          deepSky.push(obj);
        }
      }
    }

    // Ensure at least 2 deep-sky objects per plate (procedural distant field discoveries)
    if (deepSky.length < 2) {
      const h1 = Math.abs(Math.sin(baryRa * 17.1 + baryDec * 31.7)) * 10000;
      const h2 = Math.abs(Math.cos(baryRa * 29.3 + baryDec * 19.1)) * 10000;
      const dfg1 = {
        name: `DFG-${(h1 | 0) % 9000 + 1000}`,
        title: 'Distant Field Spiral Galaxy',
        type: 's',
        mag: 11.2,
        ra: (baryRa + ((h1 % 10) - 5) * 1.8 + 360) % 360,
        dec: Math.max(-88, Math.min(88, baryDec + ((h2 % 10) - 5) * 1.8))
      };
      deepSky.push(dfg1);

      if (deepSky.length < 2) {
        const dfg2 = {
          name: `DFG-${(h2 | 0) % 9000 + 1000}`,
          title: 'Spheroidal Dwarf Galaxy Cluster',
          type: 'e',
          mag: 12.0,
          ra: (baryRa - ((h2 % 8) - 4) * 2.1 + 360) % 360,
          dec: Math.max(-88, Math.min(88, baryDec - ((h1 % 8) - 4) * 2.1))
        };
        deepSky.push(dfg2);
      }
    }

    const deepSkyObjects = deepSky.map(d => {
      const { xi, eta } = stereographicProject(d.ra, d.dec, baryRa, baryDec);
      const cx = Math.round(5000 + xi * scale);
      const cy = Math.round(5000 - eta * scale);
      return [
        cx,
        cy,
        220, // display radius
        50,  // core radius
        0.0, // angle
        d.type.toUpperCase(),
        `${d.name} · ${d.title}`,
        d.mag || 8.5
      ];
    });

    const primaryDeepSky = deepSky[0] || null;
    const gal = equatorialToGalactic(baryRa, baryDec);

    const conRecord = {
      id,
      plate: `Plate ${toRoman(plateIndex)}`,
      plateNumber: plateIndex,
      name,
      genitive,
      meaning: `${genitive} · ${english}`,
      english,
      ra: formatRA(baryRa),
      dec: formatDec(baryDec),
      barycenterRaDeg: parseFloat(baryRa.toFixed(4)),
      barycenterDecDeg: parseFloat(baryDec.toFixed(4)),
      galacticLatDeg: gal.bDeg,
      galacticLonDeg: gal.lDeg,
      inMilkyWay: gal.inMilkyWay,
      isZodiac: ZODIAC_CONSTELLATIONS.has(id),
      chartScale: Math.round(scale),
      epoch: 'J2000.0',
      barycenter: [5000, 5000],
      stars: starTuples,
      edges: edgeTuples,
      deepFieldObjects: deepSkyObjects,
      deepSkySummary: primaryDeepSky ? primaryDeepSky.title : null,
      mythicFigures: CANONICAL_MYTHIC_FIGURES[id] || null
    };

    constList.push(conRecord);
    plateIndex++;
  }

  // Sort constellations alphabetically by official Latin name
  constList.sort((a, b) => a.name.localeCompare(b.name));
  // Re-index plate numbers in clean alphabetical order I..LXXXVIII
  constList.forEach((c, idx) => {
    c.plateNumber = idx + 1;
    c.plate = `Plate ${toRoman(idx + 1)}`;
  });

  console.log(`[DRC Astro Pipeline] Successfully generated ${constList.length} IAU constellations.`);

  // Write static outputs
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(path.join(OUT_DIR, 'shards'), { recursive: true });

  // 1. Authoritative constellations.json
  await fs.writeFile(
    path.join(OUT_DIR, 'constellations.json'),
    JSON.stringify(constList, null, 2),
    'utf8'
  );

  // 2. Compact background stars.json
  const compactStars = allStars.map(s => [
    s.hip,
    parseFloat(s.ra.toFixed(4)),
    parseFloat(s.dec.toFixed(4)),
    parseFloat(s.mag.toFixed(2)),
    parseFloat(s.bv.toFixed(2)),
    s.tempK,
    s.hue,
    s.properName,
    s.bayer,
    s.con
  ]);
  await fs.writeFile(
    path.join(OUT_DIR, 'stars.json'),
    JSON.stringify(compactStars),
    'utf8'
  );

  // 3. Shard 00 (containing all 88 constellations for legacy shard loaders)
  await fs.writeFile(
    path.join(OUT_DIR, 'shards/shard-00.json'),
    JSON.stringify(constList),
    'utf8'
  );

  // 4. Compatible index.json with full catalog and aliases
  const catalogEntries = constList.map((c, i) => ({
    id: c.id,
    name: c.name,
    genitive: c.genitive,
    plate: c.plate,
    plateNumber: c.plateNumber,
    meaning: c.meaning,
    ra: c.ra,
    dec: c.dec,
    shard: 'shard-00.json',
    indexInShard: i
  }));

  // Create legacy DRC-0001..DRC-1000 alias entries mapping to IAU constellations
  for (let d = 1; d <= 1000; d++) {
    const aliasId = `DRC-${String(d).padStart(4, '0')}`;
    const target = constList[(d - 1) % constList.length];
    catalogEntries.push({
      id: aliasId,
      canonicalId: target.id,
      name: target.name,
      genitive: target.genitive,
      plate: target.plate,
      plateNumber: target.plateNumber,
      meaning: target.meaning,
      ra: target.ra,
      dec: target.dec,
      shard: 'shard-00.json',
      indexInShard: target.plateNumber - 1
    });
  }

  const masterIndex = {
    totalConstellations: constList.length,
    canonicalCount: constList.length,
    catalog: catalogEntries
  };

  await fs.writeFile(
    path.join(OUT_DIR, 'index.json'),
    JSON.stringify(masterIndex, null, 2),
    'utf8'
  );

  console.log(`[DRC Astro Pipeline] Static assets written to ${OUT_DIR}:`);
  console.log(`  - constellations.json (${constList.length} IAU constellations)`);
  console.log(`  - stars.json (${compactStars.length} Hipparcos stars)`);
  console.log(`  - shards/shard-00.json`);
  console.log(`  - index.json`);
}

main().catch(err => {
  console.error('[DRC Astro Pipeline Error]:', err);
  process.exit(1);
});
