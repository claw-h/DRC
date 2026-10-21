import { createClient, type Client } from '@libsql/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SystemState, FacultyProfile } from './system-state.ts';

let cachedClient: Client | null = null;

export function getTursoClient(): Client | null {
  if (cachedClient) return cachedClient;

  const url = process.env.TURSO_DATABASE_URL || (import.meta as any).env?.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || (import.meta as any).env?.TURSO_AUTH_TOKEN;

  if (!url) {
    return null;
  }

  try {
    cachedClient = createClient({
      url,
      authToken,
    });
    return cachedClient;
  } catch (err) {
    console.error('[Turso Client Init Error]', err);
    return null;
  }
}

// -------------------------------------------------------------
// In-Memory Workspace Cache (TTL + Instant Invalidation)
// -------------------------------------------------------------
export interface ObservatoryWorkspacePayload {
  systemState: SystemState;
  profile: FacultyProfile;
  publications: any[];
  books: any[];
  classes: any[];
}

let cachedWorkspaceData: ObservatoryWorkspacePayload | null = null;
let workspaceCachedAt = 0;
const WORKSPACE_CACHE_TTL = 30_000; // 30 seconds

export function invalidateTursoCache(): void {
  cachedWorkspaceData = null;
  workspaceCachedAt = 0;
}

// -------------------------------------------------------------
// System State Database Access
// -------------------------------------------------------------
export async function fetchSystemStateFromDb(): Promise<SystemState | null> {
  const db = getTursoClient();
  if (!db) return null;

  try {
    const rs = await db.execute("SELECT offline_mode, featured_constellation_id, updated_at FROM system_state WHERE id = 'current' LIMIT 1");
    if (!rs.rows.length) return null;

    const row = rs.rows[0];
    return {
      offlineMode: Boolean(row.offline_mode),
      featuredConstellationId: (row.featured_constellation_id as string) || null,
      updatedAt: (row.updated_at as string) || new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[Turso] fetchSystemStateFromDb error:', err);
    return null;
  }
}

export async function persistSystemStateToDb(state: SystemState): Promise<boolean> {
  const db = getTursoClient();
  if (!db) return false;

  try {
    await db.execute({
      sql: `INSERT OR REPLACE INTO system_state (id, offline_mode, featured_constellation_id, updated_at)
            VALUES ('current', ?, ?, ?)`,
      args: [state.offlineMode ? 1 : 0, state.featuredConstellationId, state.updatedAt],
    });
    invalidateTursoCache();
    return true;
  } catch (err) {
    console.error('[Turso] persistSystemStateToDb error:', err);
    return false;
  }
}

// -------------------------------------------------------------
// Faculty Profile Database Access
// -------------------------------------------------------------
export async function fetchFacultyProfileFromDb(): Promise<FacultyProfile | null> {
  const db = getTursoClient();
  if (!db) return null;

  try {
    const rs = await db.execute("SELECT * FROM faculty_profile WHERE id = 'current' LIMIT 1");
    if (!rs.rows.length) return null;

    const row = rs.rows[0];
    return {
      name: String(row.name || ''),
      monogram: String(row.monogram || 'DRC'),
      credentialId: String(row.credential_id || 'ASHOKA-PHIL-DRC'),
      title: String(row.title || ''),
      department: String(row.department || ''),
      education: (row.education as string) || undefined,
      office: String(row.office || ''),
      officeHours: String(row.office_hours || ''),
      phone: String(row.phone || ''),
      email: String(row.email || ''),
      portraitUrl: String(row.portrait_url || '/images/duncan-cordry-portrait.webp'),
      institution: String(row.institution || 'Ashoka University'),
      bio: (row.bio as string) || undefined,
      aos: row.aos ? JSON.parse(String(row.aos)) : [],
      aoc: row.aoc ? JSON.parse(String(row.aoc)) : [],
      awards: row.awards ? JSON.parse(String(row.awards)) : [],
      ashokaProfileUrl: (row.ashoka_profile_url as string) || undefined,
      philPeopleUrl: (row.phil_people_url as string) || undefined,
    };
  } catch (err) {
    console.warn('[Turso] fetchFacultyProfileFromDb error:', err);
    return null;
  }
}

export async function persistFacultyProfileToDb(profile: FacultyProfile): Promise<boolean> {
  const db = getTursoClient();
  if (!db) return false;

  try {
    await db.execute({
      sql: `INSERT OR REPLACE INTO faculty_profile (
              id, name, monogram, credential_id, title, department, education,
              office, office_hours, phone, email, portrait_url, institution, bio,
              aos, aoc, awards, ashoka_profile_url, phil_people_url, updated_at
            ) VALUES ('current', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        profile.name,
        profile.monogram,
        profile.credentialId,
        profile.title,
        profile.department,
        profile.education || null,
        profile.office,
        profile.officeHours,
        profile.phone,
        profile.email,
        profile.portraitUrl,
        profile.institution,
        profile.bio || null,
        JSON.stringify(profile.aos || []),
        JSON.stringify(profile.aoc || []),
        JSON.stringify(profile.awards || []),
        profile.ashokaProfileUrl || null,
        profile.philPeopleUrl || null,
        new Date().toISOString(),
      ],
    });
    invalidateTursoCache();
    return true;
  } catch (err) {
    console.error('[Turso] persistFacultyProfileToDb error:', err);
    return false;
  }
}

// -------------------------------------------------------------
// Publications CRUD
// -------------------------------------------------------------
export async function persistPublicationToDb(item: any): Promise<boolean> {
  const db = getTursoClient();
  if (!db) return false;

  try {
    await db.execute({
      sql: `INSERT OR REPLACE INTO publications (
              id, title, subtitle, year, venue, volume_issue, co_authors,
              abstract, doi, pdf_url, citation_bibtex, sections, references_data, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        item.id,
        item.title,
        item.subtitle || null,
        Number(item.year) || new Date().getFullYear(),
        item.venue || 'Academic Press',
        item.volumeIssue || null,
        JSON.stringify(item.coAuthors || []),
        item.abstract || '',
        item.doi || null,
        item.pdfUrl || null,
        item.citationBibtex || '',
        JSON.stringify(item.sections || []),
        JSON.stringify(item.references || []),
        new Date().toISOString(),
      ],
    });
    invalidateTursoCache();
    return true;
  } catch (err) {
    console.error('[Turso] persistPublicationToDb error:', err);
    return false;
  }
}

export async function deletePublicationFromDb(id: string): Promise<boolean> {
  const db = getTursoClient();
  if (!db) return false;

  try {
    await db.execute({
      sql: 'DELETE FROM publications WHERE id = ?',
      args: [id],
    });
    invalidateTursoCache();
    return true;
  } catch (err) {
    console.error('[Turso] deletePublicationFromDb error:', err);
    return false;
  }
}

// -------------------------------------------------------------
// Books CRUD
// -------------------------------------------------------------
export async function persistBookToDb(item: any): Promise<boolean> {
  const db = getTursoClient();
  if (!db) return false;

  try {
    await db.execute({
      sql: `INSERT OR REPLACE INTO books (
              id, title, subtitle, year, publisher, isbn, pages, cover_image,
              synopsis, endorsements, chapters, purchase_links, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        item.id,
        item.title,
        item.subtitle || null,
        Number(item.year) || new Date().getFullYear(),
        item.publisher || 'Ashoka Monograph',
        item.isbn || '',
        Number(item.pages) || 200,
        item.coverImage || '/images/books/celestial-mechanics.svg',
        item.synopsis || '',
        JSON.stringify(item.endorsements || []),
        JSON.stringify(item.chapters || []),
        JSON.stringify(item.purchaseLinks || []),
        new Date().toISOString(),
      ],
    });
    invalidateTursoCache();
    return true;
  } catch (err) {
    console.error('[Turso] persistBookToDb error:', err);
    return false;
  }
}

export async function deleteBookFromDb(id: string): Promise<boolean> {
  const db = getTursoClient();
  if (!db) return false;

  try {
    await db.execute({
      sql: 'DELETE FROM books WHERE id = ?',
      args: [id],
    });
    invalidateTursoCache();
    return true;
  } catch (err) {
    console.error('[Turso] deleteBookFromDb error:', err);
    return false;
  }
}

// -------------------------------------------------------------
// Classes CRUD
// -------------------------------------------------------------
export async function persistClassToDb(item: any): Promise<boolean> {
  const db = getTursoClient();
  if (!db) return false;

  try {
    await db.execute({
      sql: `INSERT OR REPLACE INTO classes (
              id, course_code, title, academic_year, term, level, schedule,
              syllabus_pdf, summary, weeks, reviews, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        item.id,
        item.courseCode,
        item.title,
        item.academicYear || '2025–2026',
        item.term || 'Monsoon',
        item.level || 'Seminar',
        item.schedule || 'Ashoka University',
        item.syllabusPdf || null,
        item.summary || '',
        JSON.stringify(item.weeks || []),
        JSON.stringify(item.reviews || []),
        new Date().toISOString(),
      ],
    });
    invalidateTursoCache();
    return true;
  } catch (err) {
    console.error('[Turso] persistClassToDb error:', err);
    return false;
  }
}

export async function deleteClassFromDb(id: string): Promise<boolean> {
  const db = getTursoClient();
  if (!db) return false;

  try {
    await db.execute({
      sql: 'DELETE FROM classes WHERE id = ?',
      args: [id],
    });
    invalidateTursoCache();
    return true;
  } catch (err) {
    console.error('[Turso] deleteClassFromDb error:', err);
    return false;
  }
}

// -------------------------------------------------------------
// Read Content Record (Fallback for Vercel Serverless)
// -------------------------------------------------------------
export async function fetchContentRecordFromDb(type: 'publications' | 'books' | 'classes', id: string): Promise<{ data: any; body: string } | null> {
  const db = getTursoClient();
  if (!db) return null;

  try {
    const table = type === 'publications' ? 'publications' : type === 'books' ? 'books' : 'classes';
    const rs = await db.execute({
      sql: `SELECT * FROM ${table} WHERE id = ? LIMIT 1`,
      args: [id],
    });
    if (!rs.rows.length) return null;

    const row = rs.rows[0];
    if (type === 'publications') {
      const data = {
        id: row.id,
        title: row.title,
        subtitle: row.subtitle || undefined,
        year: Number(row.year),
        venue: row.venue,
        volumeIssue: row.volume_issue || undefined,
        coAuthors: row.co_authors ? JSON.parse(String(row.co_authors)) : [],
        abstract: String(row.abstract || ''),
        doi: row.doi || undefined,
        pdfUrl: row.pdf_url || undefined,
        citationBibtex: String(row.citation_bibtex || ''),
        sections: row.sections ? JSON.parse(String(row.sections)) : [],
        references: row.references_data ? JSON.parse(String(row.references_data)) : [],
      };
      return { data, body: String(row.abstract || '') };
    } else if (type === 'books') {
      const data = {
        id: row.id,
        title: row.title,
        subtitle: row.subtitle || undefined,
        year: Number(row.year),
        publisher: row.publisher,
        isbn: row.isbn,
        pages: Number(row.pages),
        coverImage: row.cover_image,
        synopsis: String(row.synopsis || ''),
        endorsements: row.endorsements ? JSON.parse(String(row.endorsements)) : [],
        chapters: row.chapters ? JSON.parse(String(row.chapters)) : [],
        purchaseLinks: row.purchase_links ? JSON.parse(String(row.purchase_links)) : [],
      };
      return { data, body: String(row.synopsis || '') };
    } else if (type === 'classes') {
      const data = {
        id: row.id,
        courseCode: row.course_code,
        title: row.title,
        academicYear: row.academic_year,
        term: row.term,
        level: row.level,
        schedule: row.schedule,
        syllabusPdf: row.syllabus_pdf || undefined,
        summary: String(row.summary || ''),
        weeks: row.weeks ? JSON.parse(String(row.weeks)) : [],
        reviews: row.reviews ? JSON.parse(String(row.reviews)) : [],
      };
      return { data, body: String(row.summary || '') };
    }
    return null;
  } catch (err) {
    console.error('[Turso] fetchContentRecordFromDb error:', err);
    return null;
  }
}

// -------------------------------------------------------------
// Complete Database Export for Backups
// -------------------------------------------------------------
export async function exportAllDataForBackup() {
  const db = getTursoClient();
  if (!db) return null;

  try {
    const [sysRes, profRes, pubRes, bookRes, classRes] = await Promise.all([
      db.execute("SELECT * FROM system_state"),
      db.execute("SELECT * FROM faculty_profile"),
      db.execute("SELECT * FROM publications"),
      db.execute("SELECT * FROM books"),
      db.execute("SELECT * FROM classes"),
    ]);

    return {
      system_state: sysRes.rows,
      faculty_profile: profRes.rows,
      publications: pubRes.rows,
      books: bookRes.rows,
      classes: classRes.rows,
    };
  } catch (err) {
    console.error('[Turso] exportAllDataForBackup error:', err);
    return null;
  }
}

// -------------------------------------------------------------
// Static Fallback Helpers
// -------------------------------------------------------------
async function loadStaticFallback(collectionName: 'publications' | 'books' | 'classes') {
  try {
    const { getCollection } = await import('astro:content');
    return await getCollection(collectionName);
  } catch {
    return [];
  }
}

async function getFallbackSystemState(): Promise<SystemState> {
  try {
    const raw = await fs.readFile(path.resolve(process.cwd(), 'src/data/system-state.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      offlineMode: false,
      featuredConstellationId: null,
      updatedAt: new Date().toISOString(),
    };
  }
}

async function getFallbackFacultyProfile(): Promise<FacultyProfile> {
  try {
    const raw = await fs.readFile(path.resolve(process.cwd(), 'src/data/profile.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      name: 'Duncan R. Cordry',
      monogram: 'DRC',
      credentialId: 'ASHOKA-PHIL-DRC',
      title: 'Visiting Faculty of Philosophy',
      department: 'Department of Philosophy',
      education: 'Ph.D. in Philosophy, Purdue University',
      office: 'Faculty Block · Rajiv Gandhi Education City, Sonipat',
      officeHours: 'By Appointment · Semesters I & II',
      phone: '+91 (0130) 230-0000',
      email: 'duncan.cordry@ashoka.edu.in',
      portraitUrl: '/images/duncan-cordry-portrait.webp',
      institution: 'Ashoka University',
      bio: 'Duncan Cordry specializes in continental philosophy and the philosophy of technology.',
      aos: ['Continental Philosophy', 'Social & Political Philosophy', 'Philosophy of Technology'],
      aoc: ['Phenomenology', 'Insurrectionist Ethics', 'American Pragmatism', 'Philosophies of Liberation'],
      awards: [
        'Claudia Jones Award for Best Graduate Paper, Caribbean Philosophical Association',
        'Ross-Lynn Research Fellowship, Purdue University',
      ],
      ashokaProfileUrl: 'https://www.ashoka.edu.in/profile/duncan-cordry/',
      philPeopleUrl: 'https://philpeople.org/profiles/duncan-r-cordry',
    };
  }
}

// -------------------------------------------------------------
// Unified Instant Loader (Single Batched HTTP Roundtrip + In-Memory Micro-Cache)
// -------------------------------------------------------------
export async function loadObservatoryWorkspaceData(forceFresh = false): Promise<ObservatoryWorkspacePayload> {
  const now = Date.now();
  if (!forceFresh && cachedWorkspaceData && (now - workspaceCachedAt) < WORKSPACE_CACHE_TTL) {
    return cachedWorkspaceData;
  }

  const db = getTursoClient();
  if (db) {
    try {
      const [sysRs, profRs, pubRs, bookRs, clsRs] = await db.batch([
        "SELECT offline_mode, featured_constellation_id, updated_at FROM system_state WHERE id = 'current' LIMIT 1",
        "SELECT * FROM faculty_profile WHERE id = 'current' LIMIT 1",
        "SELECT * FROM publications ORDER BY year DESC",
        "SELECT * FROM books ORDER BY year DESC",
        "SELECT * FROM classes"
      ]);

      const systemState: SystemState = sysRs.rows.length ? {
        offlineMode: Boolean(sysRs.rows[0].offline_mode),
        featuredConstellationId: (sysRs.rows[0].featured_constellation_id as string) || null,
        updatedAt: (sysRs.rows[0].updated_at as string) || new Date().toISOString(),
      } : await getFallbackSystemState();

      const profRow = profRs.rows[0];
      const profile: FacultyProfile = profRow ? {
        name: String(profRow.name || ''),
        monogram: String(profRow.monogram || 'DRC'),
        credentialId: String(profRow.credential_id || 'ASHOKA-PHIL-DRC'),
        title: String(profRow.title || ''),
        department: String(profRow.department || ''),
        education: (profRow.education as string) || undefined,
        office: String(profRow.office || ''),
        officeHours: String(profRow.office_hours || ''),
        phone: String(profRow.phone || ''),
        email: String(profRow.email || ''),
        portraitUrl: String(profRow.portrait_url || '/images/duncan-cordry-portrait.webp'),
        institution: String(profRow.institution || 'Ashoka University'),
        bio: (profRow.bio as string) || undefined,
        aos: profRow.aos ? JSON.parse(String(profRow.aos)) : [],
        aoc: profRow.aoc ? JSON.parse(String(profRow.aoc)) : [],
        awards: profRow.awards ? JSON.parse(String(profRow.awards)) : [],
        ashokaProfileUrl: (profRow.ashoka_profile_url as string) || undefined,
        philPeopleUrl: (profRow.phil_people_url as string) || undefined,
      } : await getFallbackFacultyProfile();

      const publications = pubRs.rows.map((row) => ({
        id: String(row.id),
        data: {
          id: String(row.id),
          title: String(row.title),
          subtitle: (row.subtitle as string) || undefined,
          year: Number(row.year),
          venue: String(row.venue),
          volumeIssue: (row.volume_issue as string) || undefined,
          coAuthors: row.co_authors ? JSON.parse(String(row.co_authors)) : [],
          abstract: String(row.abstract || ''),
          doi: (row.doi as string) || undefined,
          pdfUrl: (row.pdf_url as string) || undefined,
          citationBibtex: String(row.citation_bibtex || ''),
          sections: row.sections ? JSON.parse(String(row.sections)) : [],
          references: row.references_data ? JSON.parse(String(row.references_data)) : [],
        },
      }));

      const books = bookRs.rows.map((row) => ({
        id: String(row.id),
        data: {
          id: String(row.id),
          title: String(row.title),
          subtitle: (row.subtitle as string) || undefined,
          year: Number(row.year),
          publisher: String(row.publisher),
          isbn: String(row.isbn),
          pages: Number(row.pages),
          coverImage: String(row.cover_image),
          synopsis: String(row.synopsis || ''),
          endorsements: row.endorsements ? JSON.parse(String(row.endorsements)) : [],
          chapters: row.chapters ? JSON.parse(String(row.chapters)) : [],
          purchaseLinks: row.purchase_links ? JSON.parse(String(row.purchase_links)) : [],
        },
      }));

      const classes = clsRs.rows.map((row) => ({
        id: String(row.id),
        data: {
          id: String(row.id),
          courseCode: String(row.course_code),
          title: String(row.title),
          academicYear: String(row.academic_year),
          term: String(row.term),
          level: String(row.level),
          schedule: String(row.schedule),
          syllabusPdf: (row.syllabus_pdf as string) || undefined,
          summary: String(row.summary || ''),
          weeks: row.weeks ? JSON.parse(String(row.weeks)) : [],
          reviews: row.reviews ? JSON.parse(String(row.reviews)) : [],
        },
      }));

      const payload: ObservatoryWorkspacePayload = {
        systemState,
        profile,
        publications: publications.length ? publications : await loadStaticFallback('publications'),
        books: books.length ? books : await loadStaticFallback('books'),
        classes: classes.length ? classes : await loadStaticFallback('classes'),
      };

      cachedWorkspaceData = payload;
      workspaceCachedAt = now;
      return payload;
    } catch (err) {
      console.warn('[Turso] loadObservatoryWorkspaceData batch error, using fallback:', err);
    }
  }

  // Fallback if Turso is unreachable
  const fallbackPayload: ObservatoryWorkspacePayload = {
    systemState: await getFallbackSystemState(),
    profile: await getFallbackFacultyProfile(),
    publications: await loadStaticFallback('publications'),
    books: await loadStaticFallback('books'),
    classes: await loadStaticFallback('classes'),
  };
  return fallbackPayload;
}

// -------------------------------------------------------------
// Unified Getters (Leverage Batched Loader)
// -------------------------------------------------------------
export async function getPublicationsList(): Promise<any[]> {
  const data = await loadObservatoryWorkspaceData();
  return data.publications;
}

export async function getBooksList(): Promise<any[]> {
  const data = await loadObservatoryWorkspaceData();
  return data.books;
}

export async function getClassesList(): Promise<any[]> {
  const data = await loadObservatoryWorkspaceData();
  return data.classes;
}
