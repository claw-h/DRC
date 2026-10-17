import fs from 'node:fs/promises';
import path from 'node:path';

const PREFIXES = [
  ['Vela', 'The Celestial Sail'],
  ['Horologium', 'The Pendulum Clock'],
  ['Astrolabium', 'The Brass Astrolabe'],
  ['Quadrans', 'The Mural Quadrant'],
  ['Sextans', 'The Navigator Sextant'],
  ['Armilla', 'The Equatorial Ring'],
  ['Cygnus', 'The Northern Swan'],
  ['Lyra', 'The Orphic Harp'],
  ['Corona', 'The Meridian Crown'],
  ['Circinus', 'The Geometer Compass'],
  ['Telescopium', 'The Great Refractor'],
  ['Reticulum', 'The Crosshair Reticle'],
  ['Octans', 'The Polar Octant'],
  ['Pyxis', 'The Mariner Binnacle'],
  ['Norma', 'The Drafter Square'],
  ['Fornax', 'The Alchemical Furnace'],
  ['Caelum', 'The Engraver Burin'],
  ['Antlia', 'The Pneumatic Vessel'],
  ['Triangulum', 'The Triangulation Arc'],
  ['Scutum', 'The Sobieski Shield'],
  ['Equuleus', 'The First Foal'],
  ['Delphinus', 'The Poseidon Messenger'],
  ['Sagitta', 'The Apolline Arrow'],
  ['Vulpecula', 'The Astral Fox'],
  ['Monoceros', 'The Winter Unicorn'],
];

const SUFFIXES = [
  ['Minor', 'of the Lesser Arc'],
  ['Major', 'of the Greater Meridian'],
  ['Borealis', 'of the Northern Vault'],
  ['Australis', 'of the Southern Deep'],
  ['Profundi', 'of the Abyssal Rift'],
  ['Aeterna', 'of the Immutable Epoch'],
  ['Epistemicus', 'of Pure Measurement'],
  ['Muralis', 'of the Stone Observatory'],
  ['Prisca', 'of the Ancient Catalog'],
  ['Secunda', 'of the Second Transit'],
  ['Tertia', 'of the Third Harmonic'],
  ['Vespera', 'of the Evening Equinox'],
  ['Matutina', 'of the Vernal Solstice'],
  ['Caelestis', 'of the Outer Sphere'],
  ['Nocturna', 'of the Meridian Watch'],
  ['Sideris', 'of the Fixed Stars'],
  ['Umbrae', 'of the Ecliptic Shadow'],
  ['Lucida', 'of the First Magnitude'],
  ['Occulta', 'of the Hidden Parallax'],
  ['Regia', 'of the Royal Ephemeris'],
];

// Deterministic Mulberry32 PRNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NEBULA_ARCHETYPES = [
  {
    id: 'HII_EMISSION',
    label: 'H II Balmer Emission Nursery',
    catalogPrefix: 'NGC',
    // Primary Ha Rose, Secondary OIII Teal, Core Champagne
    palette: [
      [198, 74, 106],
      [74, 184, 212],
      [236, 212, 162],
    ],
    anisotropy: 2.2,
  },
  {
    id: 'PLEIADES_REFLECTION',
    label: 'Rayleigh Silicate Reflection Nebula',
    catalogPrefix: 'vdB',
    // Primary Sapphire, Secondary Ice Cyan, Core Silver-Gold
    palette: [
      [68, 126, 224],
      [138, 198, 255],
      [228, 220, 198],
    ],
    anisotropy: 2.8,
  },
  {
    id: 'SUPERNOVA_REMNANT',
    label: 'Filamentary Veil Shock Remnant',
    catalogPrefix: 'Sh2',
    // Primary Indigo-Violet, Secondary Electric Cyan, Core Antique Amber
    palette: [
      [124, 86, 208],
      [88, 206, 232],
      [222, 176, 114],
    ],
    anisotropy: 3.6,
  },
  {
    id: 'MOLECULAR_GOLD',
    label: 'Alchemical Molecular Cloud & Bok Rift',
    catalogPrefix: 'Barnard',
    // Primary Ochre Gold, Secondary Warm Sienna, Core Pale Brass
    palette: [
      [214, 168, 96],
      [164, 102, 64],
      [242, 222, 178],
    ],
    anisotropy: 2.4,
  },
  {
    id: 'PLANETARY_HALO',
    label: 'Ionized Bipolar Nebular Shell',
    catalogPrefix: 'PK',
    // Primary Emerald-Teal, Secondary Rose-Crimson, Core Luminous Gold
    palette: [
      [72, 192, 174],
      [188, 82, 114],
      [234, 204, 148],
    ],
    anisotropy: 1.85,
  },
];

function generateNebulaForConstellation(index, rng, rawStars, spineAngle) {
  const archIdx = (index + Math.floor(rng() * 3)) % NEBULA_ARCHETYPES.length;
  const arch = NEBULA_ARCHETYPES[archIdx];
  const catNum = 104 + ((index * 37 + Math.floor(rng() * 89)) % 7800);
  const designation = `${arch.catalogPrefix} ${catNum} · ${arch.label}`;

  // Compute constellation barycenter in 0..10000 space
  let sumX = 0;
  let sumY = 0;
  for (const s of rawStars) {
    sumX += s[0];
    sumY += s[1];
  }
  const centerX = Math.round(sumX / Math.max(1, rawStars.length));
  const centerY = Math.round(sumY / Math.max(1, rawStars.length));

  // 1. Volumetric Filaments (15 multi-depth cloud structures aligned with spine + star nodes)
  // Tuple: [x(0..10000), y(0..10000), rx(0..10000), ry(0..10000), angleRad, depthLayer(0|1|2), colorSlot(0|1|2), alpha(0..1)]
  const filaments = [];
  const filamentCount = 15;
  for (let i = 0; i < filamentCount; i++) {
    const anchorStar = rawStars[i % rawStars.length];
    const blendToCenter = i < 5 ? 0.65 : 0.28;
    const baseX = anchorStar[0] * (1 - blendToCenter) + centerX * blendToCenter;
    const baseY = anchorStar[1] * (1 - blendToCenter) + centerY * blendToCenter;

    const jitterX = (rng() - 0.5) * 1900;
    const jitterY = (rng() - 0.5) * 1600;
    const fx = Math.max(800, Math.min(9200, Math.round(baseX + jitterX)));
    const fy = Math.max(800, Math.min(9200, Math.round(baseY + jitterY)));

    const depthLayer = i < 5 ? 0 : i < 11 ? 1 : 2;
    const scaleMult = depthLayer === 0 ? 1.45 : depthLayer === 1 ? 1.0 : 0.68;
    const rx = Math.round((950 + rng() * 1450) * scaleMult);
    const ry = Math.round(rx / (arch.anisotropy * (0.75 + rng() * 0.55)));
    const angle = Number((spineAngle + (rng() - 0.5) * 0.95).toFixed(3));
    const colorSlot = i % 3;
    const alpha = Number((0.12 + rng() * 0.16).toFixed(3));

    filaments.push([fx, fy, rx, ry, angle, depthLayer, colorSlot, alpha]);
  }

  // 2. Barnard Dark Dust Lanes / Bok Globules (carving 3D foreground occlusion crevices)
  // Tuple: [x, y, rx, ry, angleRad, opacity]
  const darkRifts = [];
  const riftCount = 5;
  for (let i = 0; i < riftCount; i++) {
    const refStar = rawStars[(i * 2) % rawStars.length];
    const rxPos = Math.round(centerX * 0.5 + refStar[0] * 0.5 + (rng() - 0.5) * 1400);
    const ryPos = Math.round(centerY * 0.5 + refStar[1] * 0.5 + (rng() - 0.5) * 1200);
    const rx = Math.round(700 + rng() * 1100);
    const ry = Math.round(180 + rng() * 340);
    const angle = Number((spineAngle + (rng() - 0.5) * 0.65).toFixed(3));
    const op = Number((0.42 + rng() * 0.32).toFixed(2));
    darkRifts.push([rxPos, ryPos, rx, ry, angle, op]);
  }

  // 3. Ionized Proto-Stellar Brightness Knots near Alpha/Beta/Gamma stars
  // Tuple: [x, y, radius, colorSlot, intensity]
  const knots = [];
  const knotCount = Math.min(rawStars.length, 6);
  for (let i = 0; i < knotCount; i++) {
    const st = rawStars[i];
    const kx = Math.round(st[0] + (rng() - 0.5) * 320);
    const ky = Math.round(st[1] + (rng() - 0.5) * 320);
    const kr = Math.round(280 + rng() * 420);
    const colorSlot = i === 0 ? 2 : i % 2;
    const intensity = Number((0.22 + rng() * 0.18).toFixed(2));
    knots.push([kx, ky, kr, colorSlot, intensity]);
  }

  return {
    archetype: arch.id,
    designation,
    spineAngle: Number(spineAngle.toFixed(3)),
    barycenter: [centerX, centerY],
    palette: arch.palette,
    filaments,
    darkRifts,
    knots,
  };
}

function generateConstellation(index) {
  const rng = mulberry32(104729 * (index + 1) + 7919);
  const id = `DRC-${String(index + 1).padStart(4, '0')}`;

  const pIdx = index % PREFIXES.length;
  const sIdx = Math.floor(index / PREFIXES.length) % SUFFIXES.length;
  const romanCycle = Math.floor(index / (PREFIXES.length * SUFFIXES.length));
  const numeral = romanCycle > 0 ? ` ${['II', 'III', 'IV', 'V'][romanCycle - 1] || ''}` : '';

  const name = `${PREFIXES[pIdx][0]} ${SUFFIXES[sIdx][0]}${numeral}`;
  const meaning = `${PREFIXES[pIdx][1]} ${SUFFIXES[sIdx][1]}`;

  // RA & Dec J2000.0
  const raH = String(Math.floor(rng() * 24)).padStart(2, '0');
  const raM = String(Math.floor(rng() * 60)).padStart(2, '0');
  const raS = (rng() * 59.9).toFixed(1).padStart(4, '0');
  const ra = `${raH}h ${raM}m ${raS}s`;

  const decSign = rng() >= 0.45 ? '+' : '-';
  const decD = String(Math.floor(rng() * 85)).padStart(2, '0');
  const decM = String(Math.floor(rng() * 60)).padStart(2, '0');
  const decS = String(Math.floor(rng() * 60)).padStart(2, '0');
  const dec = `${decSign}${decD}° ${decM}' ${decS}"`;

  // Generate 6 to 10 stars with minimum separation so geometry looks intentional & classical
  const starCount = 6 + Math.floor(rng() * 5);
  const rawStars = [];
  let attempts = 0;

  // Spine angle for mythological posture
  const spineAngle = (rng() - 0.5) * Math.PI * 0.75;
  const cosA = Math.cos(spineAngle);
  const sinA = Math.sin(spineAngle);

  while (rawStars.length < starCount && attempts < 200) {
    attempts++;
    const t = (rawStars.length / Math.max(1, starCount - 1)) - 0.5;
    const spreadX = t * 5200 + (rng() - 0.5) * 2200;
    const spreadY = (rng() - 0.5) * 3200;

    const x = Math.round(5000 + spreadX * cosA - spreadY * sinA);
    const y = Math.round(5000 + spreadX * sinA + spreadY * cosA);

    if (x < 1600 || x > 8400 || y < 1800 || y > 8200) continue;

    let tooClose = false;
    for (const s of rawStars) {
      const dx = s[0] - x;
      const dy = s[1] - y;
      if (Math.hypot(dx, dy) < 1050) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      // Spectral class index: 0=O, 1=B, 2=A, 3=F, 4=G, 5=K, 6=M
      const specWeights = [1, 2, 2, 3, 4, 4, 5, 5, 6];
      const specIdx = specWeights[Math.floor(rng() * specWeights.length)];
      const mag = Number((0.7 + rng() * 2.8).toFixed(2));
      rawStars.push([x, y, mag, specIdx]);
    }
  }

  // Sort stars by apparent magnitude ascending (brightest = Alpha [0], Beta [1], Gamma [2]...)
  rawStars.sort((a, b) => a[2] - b[2]);
  // Ensure Alpha star is distinctly luminous
  if (rawStars.length > 0) rawStars[0][2] = Number((0.55 + rng() * 0.45).toFixed(2));

  // Build Minimum Spanning Tree (Prim's algorithm) so edges form an authentic classical figure
  const n = rawStars.length;
  const inTree = new Array(n).fill(false);
  inTree[0] = true;
  const edges = [];

  for (let step = 0; step < n - 1; step++) {
    let bestU = -1;
    let bestV = -1;
    let bestDist = Infinity;

    for (let u = 0; u < n; u++) {
      if (!inTree[u]) continue;
      for (let v = 0; v < n; v++) {
        if (inTree[v]) continue;
        const d = Math.hypot(rawStars[u][0] - rawStars[v][0], rawStars[u][1] - rawStars[v][1]);
        if (d < bestDist) {
          bestDist = d;
          bestU = u;
          bestV = v;
        }
      }
    }
    if (bestU !== -1 && bestV !== -1) {
      inTree[bestV] = true;
      edges.push([bestU, bestV]);
    }
  }

  // Build 1–2 secondary ghost construction chords between non-adjacent vertices
  const ghostChords = [];
  if (n >= 5) {
    ghostChords.push([0, n - 1]);
    if (n >= 7) ghostChords.push([1, n - 2]);
  }

  const nebula = generateNebulaForConstellation(index, rng, rawStars, spineAngle);

  return {
    id,
    name,
    meaning,
    ra,
    dec,
    epoch: 'J2000.0',
    stars: rawStars,
    edges,
    ghostChords,
    nebula,
  };
}

async function main() {
  const TOTAL = 1000;
  const SHARD_SIZE = 100;
  const outDir = path.resolve(process.cwd(), 'public/data/sky');
  const shardsDir = path.join(outDir, 'shards');

  await fs.mkdir(shardsDir, { recursive: true });

  const manifest = {
    totalConstellations: TOTAL,
    shardSize: SHARD_SIZE,
    shardCount: TOTAL / SHARD_SIZE,
    generatedEpoch: 'J2000.0',
    catalog: [],
  };

  for (let s = 0; s < TOTAL / SHARD_SIZE; s++) {
    const shardItems = [];
    const shardFile = `shard-${String(s).padStart(2, '0')}.json`;

    for (let i = 0; i < SHARD_SIZE; i++) {
      const idx = s * SHARD_SIZE + i;
      const item = generateConstellation(idx);
      shardItems.push(item);
      manifest.catalog.push({
        id: item.id,
        name: item.name,
        ra: item.ra,
        dec: item.dec,
        shard: shardFile,
        indexInShard: i,
      });
    }

    await fs.writeFile(path.join(shardsDir, shardFile), JSON.stringify(shardItems));
  }

  await fs.writeFile(path.join(outDir, 'index.json'), JSON.stringify(manifest, null, 2));
  console.log(`[DRC Sky Catalog] Generated ${TOTAL} constellations across ${TOTAL / SHARD_SIZE} shards.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
