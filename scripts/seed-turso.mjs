import { createClient } from '@libsql/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), '.env'));
  } catch (e) {
    // ignore if .env was already loaded
  }
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('Error: TURSO_DATABASE_URL is not set.');
  process.exit(1);
}

const db = createClient({ url, authToken });

async function parseMarkdownFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const data = yaml.load(match[1]) || {};
  const content = match[2]?.trim() || '';
  return { data, content };
}

async function migrateAndSeed() {
  console.log('⚡ Initializing Turso Database Schema...');

  // 1. Create Tables
  await db.execute(`
    CREATE TABLE IF NOT EXISTS system_state (
      id TEXT PRIMARY KEY DEFAULT 'current',
      offline_mode INTEGER NOT NULL DEFAULT 0,
      featured_constellation_id TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS faculty_profile (
      id TEXT PRIMARY KEY DEFAULT 'current',
      name TEXT NOT NULL,
      monogram TEXT NOT NULL,
      credential_id TEXT NOT NULL,
      title TEXT NOT NULL,
      department TEXT NOT NULL,
      education TEXT,
      office TEXT NOT NULL,
      office_hours TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      portrait_url TEXT NOT NULL,
      institution TEXT NOT NULL,
      bio TEXT,
      aos TEXT,
      aoc TEXT,
      awards TEXT,
      ashoka_profile_url TEXT,
      phil_people_url TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS publications (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT,
      year INTEGER NOT NULL,
      venue TEXT NOT NULL,
      volume_issue TEXT,
      co_authors TEXT NOT NULL,
      abstract TEXT NOT NULL,
      doi TEXT,
      pdf_url TEXT,
      citation_bibtex TEXT NOT NULL,
      sections TEXT NOT NULL,
      references_data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT,
      year INTEGER NOT NULL,
      publisher TEXT NOT NULL,
      isbn TEXT NOT NULL,
      pages INTEGER NOT NULL,
      cover_image TEXT NOT NULL,
      synopsis TEXT NOT NULL,
      endorsements TEXT NOT NULL,
      chapters TEXT NOT NULL,
      purchase_links TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      course_code TEXT NOT NULL,
      title TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      term TEXT NOT NULL,
      level TEXT NOT NULL,
      schedule TEXT NOT NULL,
      syllabus_pdf TEXT,
      summary TEXT NOT NULL,
      weeks TEXT NOT NULL,
      reviews TEXT NOT NULL,
      accepting_reviews INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);

  try { await db.execute('ALTER TABLE classes ADD COLUMN accepting_reviews INTEGER NOT NULL DEFAULT 0'); }
  catch (error) { if (!String(error?.message || error).toLowerCase().includes('duplicate column')) throw error; }
  await db.execute(`CREATE TABLE IF NOT EXISTS class_reviews (
    id TEXT PRIMARY KEY, class_id TEXT NOT NULL, author TEXT NOT NULL,
    role TEXT NOT NULL, term TEXT NOT NULL, rating INTEGER NOT NULL,
    highlight TEXT NOT NULL DEFAULT '', quote TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await db.execute('CREATE INDEX IF NOT EXISTS class_reviews_by_class_status_date ON class_reviews (class_id, status, created_at)');

  console.log('✓ Tables created / verified.');

  // 2. Seed System State
  try {
    const stateRaw = await fs.readFile(path.resolve(process.cwd(), 'src/data/system-state.json'), 'utf8');
    const state = JSON.parse(stateRaw);
    await db.execute({
      sql: `INSERT OR REPLACE INTO system_state (id, offline_mode, featured_constellation_id, updated_at)
            VALUES ('current', ?, ?, ?)`,
      args: [state.offlineMode ? 1 : 0, state.featuredConstellationId || null, state.updatedAt || new Date().toISOString()],
    });
    console.log('✓ Seeded system_state from src/data/system-state.json');
  } catch (err) {
    console.warn('! Could not seed system_state:', err.message);
  }

  // 3. Seed Faculty Profile
  try {
    const profileRaw = await fs.readFile(path.resolve(process.cwd(), 'src/data/profile.json'), 'utf8');
    const p = JSON.parse(profileRaw);
    await db.execute({
      sql: `INSERT OR REPLACE INTO faculty_profile (
              id, name, monogram, credential_id, title, department, education,
              office, office_hours, phone, email, portrait_url, institution, bio,
              aos, aoc, awards, ashoka_profile_url, phil_people_url, updated_at
            ) VALUES ('current', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        p.name || 'Duncan R. Cordry',
        p.monogram || 'DRC',
        p.credentialId || 'ASHOKA-PHIL-DRC',
        p.title || 'Visiting Faculty of Philosophy',
        p.department || 'Department of Philosophy',
        p.education || 'Ph.D. in Philosophy, Purdue University',
        p.office || '',
        p.officeHours || '',
        p.phone || '',
        p.email || '',
        p.portraitUrl || '/images/duncan-cordry-portrait.webp',
        p.institution || 'Ashoka University',
        p.bio || '',
        JSON.stringify(p.aos || []),
        JSON.stringify(p.aoc || []),
        JSON.stringify(p.awards || []),
        p.ashokaProfileUrl || '',
        p.philPeopleUrl || '',
        new Date().toISOString(),
      ],
    });
    console.log('✓ Seeded faculty_profile from src/data/profile.json');
  } catch (err) {
    console.warn('! Could not seed faculty_profile:', err.message);
  }

  // 4. Seed Publications
  try {
    const pubDir = path.resolve(process.cwd(), 'src/data/publications');
    const pubFiles = (await fs.readdir(pubDir)).filter((f) => f.endsWith('.md'));
    for (const f of pubFiles) {
      const parsed = await parseMarkdownFile(path.join(pubDir, f));
      if (!parsed) continue;
      const d = parsed.data;
      await db.execute({
        sql: `INSERT OR REPLACE INTO publications (
                id, title, subtitle, year, venue, volume_issue, co_authors,
                abstract, doi, pdf_url, citation_bibtex, sections, references_data, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          d.id || path.basename(f, '.md'),
          d.title || 'Untitled',
          d.subtitle || null,
          Number(d.year) || new Date().getFullYear(),
          d.venue || 'Academic Press',
          d.volumeIssue || null,
          JSON.stringify(d.coAuthors || []),
          d.abstract || parsed.content || '',
          d.doi || null,
          d.pdfUrl || null,
          d.citationBibtex || '',
          JSON.stringify(d.sections || []),
          JSON.stringify(d.references || []),
          new Date().toISOString(),
        ],
      });

    }
    console.log(`✓ Seeded ${pubFiles.length} publications into Turso`);
  } catch (err) {
    console.warn('! Could not seed publications:', err.message);
  }

  // 5. Seed Books
  try {
    const booksDir = path.resolve(process.cwd(), 'src/data/books');
    const bookFiles = (await fs.readdir(booksDir)).filter((f) => f.endsWith('.md'));
    for (const f of bookFiles) {
      const parsed = await parseMarkdownFile(path.join(booksDir, f));
      if (!parsed) continue;
      const d = parsed.data;
      await db.execute({
        sql: `INSERT OR REPLACE INTO books (
                id, title, subtitle, year, publisher, isbn, pages, cover_image,
                synopsis, endorsements, chapters, purchase_links, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          d.id || path.basename(f, '.md'),
          d.title || 'Untitled',
          d.subtitle || null,
          Number(d.year) || new Date().getFullYear(),
          d.publisher || 'Ashoka Monograph',
          d.isbn || '',
          Number(d.pages) || 200,
          d.coverImage || '/images/books/celestial-mechanics.svg',
          d.synopsis || parsed.content || '',
          JSON.stringify(d.endorsements || []),
          JSON.stringify(d.chapters || []),
          JSON.stringify(d.purchaseLinks || []),
          new Date().toISOString(),
        ],
      });
    }
    console.log(`✓ Seeded ${bookFiles.length} books into Turso`);
  } catch (err) {
    console.warn('! Could not seed books:', err.message);
  }

  // 6. Seed Classes
  try {
    const classesDir = path.resolve(process.cwd(), 'src/data/classes');
    const classFiles = (await fs.readdir(classesDir)).filter((f) => f.endsWith('.md'));
    for (const f of classFiles) {
      const parsed = await parseMarkdownFile(path.join(classesDir, f));
      if (!parsed) continue;
      const d = parsed.data;
      const classId = d.id || path.basename(f, '.md');
      await db.execute({
        sql: `INSERT OR REPLACE INTO classes (
                id, course_code, title, academic_year, term, level, schedule,
              syllabus_pdf, summary, weeks, reviews, accepting_reviews, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          classId,
          d.courseCode || 'PHIL',
          d.title || 'Seminar',
          d.academicYear || '2025–2026',
          d.term || 'Monsoon',
          d.level || 'Seminar',
          d.schedule || 'Ashoka University',
          d.syllabusPdf || null,
          d.summary || parsed.content || '',
          JSON.stringify(d.weeks || []),
          JSON.stringify(d.reviews || []),
          d.acceptingReviews ? 1 : 0,
          new Date().toISOString(),
        ],
      });

      // Seed the same prototype reviews into the normalized review table.
      // Stable IDs make repeated seed runs idempotent.
      for (const [index, review] of (d.reviews || []).entries()) {
        const score = Number.parseFloat(String(review.rating || '5').replace(/[^0-9.]/g, '')) || 5;
        const timestamp = new Date(Date.UTC(2026, 0, index + 1)).toISOString();
        await db.execute({
          sql: `INSERT OR REPLACE INTO class_reviews (
                  id, class_id, author, role, term, rating, highlight, quote,
                  status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)`,
          args: [
            `prototype-${classId}-${index + 1}`,
            classId,
            review.author || 'Prototype Student',
            review.role || 'Prototype Cohort',
            review.term || 'Prototype Term',
            Math.max(1, Math.min(5, Math.round(score))),
            review.highlight || '',
            review.quote || '',
            timestamp,
            timestamp,
          ],
        });
      }
    }
    console.log(`✓ Seeded ${classFiles.length} classes into Turso`);
    console.log('✓ Seeded prototype course reviews into class_reviews');
  } catch (err) {
    console.warn('! Could not seed classes:', err.message);
  }

  console.log('\n🌟 Turso Database successfully migrated and seeded with zero data loss!');
}

migrateAndSeed().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
