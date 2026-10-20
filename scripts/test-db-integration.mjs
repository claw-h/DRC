import path from 'node:path';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), '.env'));
  } catch (e) {}
}

import { getSystemState, updateSystemState, getFacultyProfile, updateFacultyProfile } from '../src/lib/system-state.ts';
import { fetchContentRecordFromDb, getTursoClient } from '../src/lib/turso.ts';

async function testIntegration() {
  console.log('--- Testing Turso Integration in DRC ---');

  // 1. Read System State
  const state = await getSystemState();
  console.log('✓ getSystemState():', {
    offlineMode: state.offlineMode,
    featuredConstellationId: state.featuredConstellationId,
  });

  // 2. Read Faculty Profile
  const profile = await getFacultyProfile();
  console.log('✓ getFacultyProfile():', {
    name: profile.name,
    title: profile.title,
    institution: profile.institution,
    aosCount: profile.aos?.length,
  });

  // 3. Test Mutation
  console.log('Testing mutation on System State...');
  const originalConstellation = state.featuredConstellationId;
  const testConstellation = 'Ori';
  await updateSystemState({ featuredConstellationId: testConstellation });

  // Query directly from Turso database client to verify persistence
  const db = getTursoClient();
  const rs = await db.execute("SELECT featured_constellation_id FROM system_state WHERE id = 'current'");
  const persistedValue = rs.rows[0].featured_constellation_id;
  console.log(`✓ Direct DB Query verified value: "${persistedValue}" (Expected: "${testConstellation}")`);

  if (persistedValue !== testConstellation) {
    throw new Error('Database persistence verification failed!');
  }

  // Restore original value
  await updateSystemState({ featuredConstellationId: originalConstellation });
  console.log(`✓ Restored original constellation: "${originalConstellation}"`);

  // 4. Test Content Retrieval from Turso
  const pubRecord = await fetchContentRecordFromDb('publications', 'cordry-2022-wynter-stiegler-myth-memory');
  if (pubRecord) {
    console.log('✓ fetchContentRecordFromDb verified publication:', pubRecord.data.title);
  } else {
    throw new Error('Could not fetch publication from Turso!');
  }

  console.log('\n🌟 ALL TURSO INTEGRATION TESTS PASSED!');
}

testIntegration().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
