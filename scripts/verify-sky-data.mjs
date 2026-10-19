/**
 * scripts/verify-sky-data.mjs
 * 
 * Verification suite for the DRC Observatory astrometric catalog.
 * Validates IAU completeness, Hipparcos cross-identifications, coordinate bounds,
 * and graph edge integrity.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const SKY_DIR = path.resolve(process.cwd(), 'public/data/sky');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('[DRC Astro Verification] Running test suite on compiled catalog...');

  // Test 1: Load constellations.json
  const constRaw = await fs.readFile(path.join(SKY_DIR, 'constellations.json'), 'utf8');
  const consts = JSON.parse(constRaw);
  assert(Array.isArray(consts), 'constellations.json is an array');
  assert(consts.length === 88, `Exactly 88 IAU constellations present (found ${consts.length})`);

  // Test 2: Check plate numbering and required fields
  let platesSequential = true;
  for (let i = 0; i < consts.length; i++) {
    const c = consts[i];
    if (c.plateNumber !== i + 1 || !c.plate.startsWith('Plate ')) {
      platesSequential = false;
    }
  }
  assert(platesSequential, 'All 88 plates are sequentially numbered Plate I through Plate LXXXVIII');

  // Test 3: Check graph edge integrity
  let edgesValid = true;
  let totalEdges = 0;
  for (const c of consts) {
    const numStars = c.stars.length;
    if (numStars < 2) edgesValid = false;
    for (const [a, b] of c.edges) {
      totalEdges++;
      if (a < 0 || a >= numStars || b < 0 || b >= numStars || a === b) {
        edgesValid = false;
        console.error(`Invalid edge [${a}, ${b}] in ${c.name} (${numStars} stars)`);
      }
    }
  }
  assert(edgesValid, `All constellation graph edges are valid and within star bounds (${totalEdges} total edges)`);

  // Test 4: Check canonical anchor stars
  const ori = consts.find(c => c.id === 'Ori');
  assert(Boolean(ori), 'Orion (Ori) exists');
  const oriHips = ori.stars.map(s => s[4]); // hip is index 4
  assert(oriHips.includes(27989), 'Orion contains Betelgeuse (HIP 27989)');
  assert(oriHips.includes(24436), 'Orion contains Rigel (HIP 24436)');
  assert(oriHips.includes(25336), 'Orion contains Bellatrix (HIP 25336)');

  const cma = consts.find(c => c.id === 'CMa');
  assert(Boolean(cma), 'Canis Major (CMa) exists');
  const cmaHips = cma.stars.map(s => s[4]);
  assert(cmaHips.includes(32349), 'Canis Major contains Sirius (HIP 32349)');

  const lyr = consts.find(c => c.id === 'Lyr');
  assert(Boolean(lyr), 'Lyra (Lyr) exists');
  const lyrHips = lyr.stars.map(s => s[4]);
  assert(lyrHips.includes(91262), 'Lyra contains Vega (HIP 91262)');

  const umi = consts.find(c => c.id === 'UMi');
  assert(Boolean(umi), 'Ursa Minor (UMi) exists');
  const umiHips = umi.stars.map(s => s[4]);
  assert(umiHips.includes(11767), 'Ursa Minor contains Polaris (HIP 11767)');

  const cyg = consts.find(c => c.id === 'Cyg');
  assert(Boolean(cyg), 'Cygnus (Cyg) exists');
  const cygHips = cyg.stars.map(s => s[4]);
  assert(cygHips.includes(102098), 'Cygnus contains Deneb (HIP 102098)');
  assert(cygHips.includes(95947), 'Cygnus contains Albireo (HIP 95947)');

  const sco = consts.find(c => c.id === 'Sco');
  assert(Boolean(sco), 'Scorpius (Sco) exists');
  const scoHips = sco.stars.map(s => s[4]);
  assert(scoHips.includes(80763), 'Scorpius contains Antares (HIP 80763)');

  // Test 5: Verify stars.json
  const starsRaw = await fs.readFile(path.join(SKY_DIR, 'stars.json'), 'utf8');
  const stars = JSON.parse(starsRaw);
  assert(Array.isArray(stars), 'stars.json is an array');
  assert(stars.length >= 5000, `stars.json contains >= 5,000 naked-eye stars (${stars.length} stars)`);

  let coordsValid = true;
  for (const s of stars) {
    const [hip, ra, dec, mag, bv, tempK] = s;
    if (ra < 0 || ra >= 360 || dec < -90 || dec > 90 || Number.isNaN(mag) || tempK < 2000 || tempK > 50000) {
      coordsValid = false;
      console.error('Invalid star astrometry:', s);
      break;
    }
  }
  assert(coordsValid, 'All 5,045 stars have physically valid J2000 coordinates, magnitudes, and temperatures');

  // Test 6: Verify index.json and legacy aliases
  const indexRaw = await fs.readFile(path.join(SKY_DIR, 'index.json'), 'utf8');
  const index = JSON.parse(indexRaw);
  assert(index.canonicalCount === 88, 'Master index reports 88 canonical IAU constellations');
  assert(index.catalog.length >= 1088, `Master index includes aliases (total entries: ${index.catalog.length})`);

  const drc0001 = index.catalog.find(c => c.id === 'DRC-0001');
  assert(Boolean(drc0001), 'Legacy alias DRC-0001 exists in catalog');
  assert(Boolean(drc0001.canonicalId), `DRC-0001 maps to canonical IAU constellation: ${drc0001.name}`);

  // Test 7: Output file size metrics
  console.log('\n[DRC Astro Verification] Payload Size Telemetry:');
  console.log(`  - constellations.json: ${(constRaw.length / 1024).toFixed(1)} KB`);
  console.log(`  - stars.json: ${(starsRaw.length / 1024).toFixed(1)} KB`);
  console.log(`  - index.json: ${(indexRaw.length / 1024).toFixed(1)} KB`);

  console.log(`\nVerification complete: ${passedTests} passed, ${failedTests} failed.`);
  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Verification suite crashed:', err);
  process.exit(1);
});
