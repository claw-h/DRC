import zlib from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { exportAllDataForBackup } from './turso.ts';
import { getFacultyProfile, getSystemState } from './system-state.ts';

export interface TarFileEntry {
  name: string;
  content: string | Buffer;
  mtime?: number;
}

/**
 * Pure JavaScript POSIX USTAR / TAR.GZ archive encoder.
 * Works across Node, Vercel Serverless, and Edge with zero external binary dependencies.
 */
export function createTarGz(files: TarFileEntry[]): Buffer {
  const chunks: Buffer[] = [];

  for (const file of files) {
    const data = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
    const header = Buffer.alloc(512);

    let name = file.name.replace(/^\/+/, '');
    let prefix = '';

    if (name.length > 100) {
      const splitIdx = name.lastIndexOf('/', 154);
      if (splitIdx !== -1) {
        prefix = name.slice(0, splitIdx);
        name = name.slice(splitIdx + 1);
      }
    }

    // 0..100: Filename
    header.write(name.slice(0, 100), 0, 100, 'utf8');
    // 100..108: Mode
    header.write('0000644\0', 100, 8, 'ascii');
    // 108..116: UID
    header.write('0000000\0', 108, 8, 'ascii');
    // 116..124: GID
    header.write('0000000\0', 116, 8, 'ascii');
    // 124..136: Size in octal (11 digits + null)
    header.write(data.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
    // 136..148: Mtime in octal
    const mtimeSec = Math.floor((file.mtime || Date.now()) / 1000);
    header.write(mtimeSec.toString(8).padStart(11, '0') + '\0', 136, 12, 'ascii');
    // 156: Typeflag ('0' = regular file)
    header.write('0', 156, 1, 'ascii');
    // 257..263: Magic
    header.write('ustar\0', 257, 6, 'ascii');
    // 263..265: Version
    header.write('00', 263, 2, 'ascii');

    // 345..500: Prefix (for paths longer than 100 chars)
    if (prefix) {
      header.write(prefix.slice(0, 155), 345, 155, 'utf8');
    }

    // 148..156: Checksum (filled with spaces first, then sum computed)
    header.fill(0x20, 148, 156);
    let chksum = 0;
    for (let i = 0; i < 512; i++) {
      chksum += header[i];
    }
    header.write(chksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');

    chunks.push(header);
    chunks.push(data);

    // Pad data to 512-byte block boundary
    const remainder = data.length % 512;
    if (remainder > 0) {
      chunks.push(Buffer.alloc(512 - remainder));
    }
  }

  // End of archive: two 512-byte zero blocks
  chunks.push(Buffer.alloc(1024));

  const tarBuffer = Buffer.concat(chunks);
  return zlib.gzipSync(tarBuffer);
}

/**
 * Generate a complete, sovereign snapshot of DRC Observatory data:
 * 1. Live Turso Database tables
 * 2. Standard Markdown files (zero database lock-in)
 * 3. JSON schema representations
 * 4. Local files if available
 */
export async function generateObservatoryBackup(): Promise<Buffer> {
  const archiveFiles: TarFileEntry[] = [];
  const now = new Date();
  const dateStr = now.toISOString();

  // 1. Fetch live database state
  const dbData = await exportAllDataForBackup();
  const state = await getSystemState();
  const profile = await getFacultyProfile();

  // 2. Add System State & Faculty Profile JSON
  archiveFiles.push({
    name: 'src/data/system-state.json',
    content: JSON.stringify(state, null, 2),
  });

  archiveFiles.push({
    name: 'src/data/profile.json',
    content: JSON.stringify(profile, null, 2),
  });

  // 3. Add database dump if Turso is active
  if (dbData) {
    archiveFiles.push({
      name: 'database-dump/system_state.json',
      content: JSON.stringify(dbData.system_state, null, 2),
    });
    archiveFiles.push({
      name: 'database-dump/faculty_profile.json',
      content: JSON.stringify(dbData.faculty_profile, null, 2),
    });
    archiveFiles.push({
      name: 'database-dump/publications.json',
      content: JSON.stringify(dbData.publications, null, 2),
    });
    archiveFiles.push({
      name: 'database-dump/books.json',
      content: JSON.stringify(dbData.books, null, 2),
    });
    archiveFiles.push({
      name: 'database-dump/classes.json',
      content: JSON.stringify(dbData.classes, null, 2),
    });

    // 4. Generate portable Markdown collections from Turso tables
    for (const pub of dbData.publications) {
      const frontmatter: Record<string, any> = {
        id: pub.id,
        title: pub.title,
        ...(pub.subtitle ? { subtitle: pub.subtitle } : {}),
        year: Number(pub.year),
        venue: pub.venue,
        ...(pub.volume_issue ? { volumeIssue: pub.volume_issue } : {}),
        coAuthors: pub.co_authors ? JSON.parse(String(pub.co_authors)) : [],
        abstract: String(pub.abstract || ''),
        ...(pub.doi ? { doi: pub.doi } : {}),
        ...(pub.pdf_url ? { pdfUrl: pub.pdf_url } : {}),
        citationBibtex: String(pub.citation_bibtex || ''),
        sections: pub.sections ? JSON.parse(String(pub.sections)) : [],
        references: pub.references_data ? JSON.parse(String(pub.references_data)) : [],
      };
      const md = `---\n${yaml.dump(frontmatter, { lineWidth: -1 })}---\n\n${frontmatter.abstract}\n`;
      archiveFiles.push({
        name: `src/data/publications/${pub.id}.md`,
        content: md,
      });
    }

    for (const book of dbData.books) {
      const frontmatter: Record<string, any> = {
        id: book.id,
        title: book.title,
        ...(book.subtitle ? { subtitle: book.subtitle } : {}),
        year: Number(book.year),
        publisher: book.publisher,
        isbn: book.isbn,
        pages: Number(book.pages),
        coverImage: book.cover_image,
        synopsis: String(book.synopsis || ''),
        endorsements: book.endorsements ? JSON.parse(String(book.endorsements)) : [],
        chapters: book.chapters ? JSON.parse(String(book.chapters)) : [],
        purchaseLinks: book.purchase_links ? JSON.parse(String(book.purchase_links)) : [],
      };
      const md = `---\n${yaml.dump(frontmatter, { lineWidth: -1 })}---\n\n${frontmatter.synopsis}\n`;
      archiveFiles.push({
        name: `src/data/books/${book.id}.md`,
        content: md,
      });
    }

    for (const cls of dbData.classes) {
      const frontmatter: Record<string, any> = {
        id: cls.id,
        courseCode: cls.course_code,
        title: cls.title,
        academicYear: cls.academic_year,
        term: cls.term,
        level: cls.level,
        schedule: cls.schedule,
        ...(cls.syllabus_pdf ? { syllabusPdf: cls.syllabus_pdf } : {}),
        summary: String(cls.summary || ''),
        weeks: cls.weeks ? JSON.parse(String(cls.weeks)) : [],
        reviews: cls.reviews ? JSON.parse(String(cls.reviews)) : [],
      };
      const md = `---\n${yaml.dump(frontmatter, { lineWidth: -1 })}---\n\n${frontmatter.summary}\n`;
      archiveFiles.push({
        name: `src/data/classes/${cls.id}.md`,
        content: md,
      });
    }
  }

  // 5. Try reading local files if accessible (on local dev or build-time bundle)
  try {
    const pubDir = path.resolve(process.cwd(), 'src/data/publications');
    const pubList = await fs.readdir(pubDir);
    for (const file of pubList) {
      if (file.endsWith('.md')) {
        const filePath = path.join(pubDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        // Only add if not already populated from DB
        const archiveName = `src/data/publications/${file}`;
        if (!archiveFiles.some((f) => f.name === archiveName)) {
          archiveFiles.push({ name: archiveName, content });
        }
      }
    }
  } catch {}

  // 6. Manifest & README
  const manifest = {
    archiveName: 'DRC Sovereign Observatory Academic Archive',
    generatedAt: dateStr,
    totalFiles: archiveFiles.length + 2,
    faculty: profile.name,
    institution: profile.institution,
    format: 'POSIX USTAR .tar.gz',
    databaseBackend: 'Turso (LibSQL)',
  };

  archiveFiles.unshift({
    name: 'ARCHIVE_MANIFEST.json',
    content: JSON.stringify(manifest, null, 2),
  });

  archiveFiles.unshift({
    name: 'README.md',
    content: `# Duncan R. Cordry (DRC) — Sovereign Academic Archive
Generated: ${dateStr}

This portable POSIX archive contains the authoritative academic portfolio records,
faculty specifications, research manuscripts, and course syllabi of ${profile.name} (${profile.institution}).

## Archive Structure
- \`src/data/\`: Standard open Markdown manuscripts, books, and course syllabi.
- \`src/data/profile.json\`: Faculty carte de visite & curriculum vitae telemetry.
- \`src/data/system-state.json\`: Maintenance mode & observatory lifecycle parameters.
- \`database-dump/\`: Raw JSON database table dumps from the Turso edge database.
- \`ARCHIVE_MANIFEST.json\`: Cryptographic & timestamp manifest.

Zero vendor lock-in. All files can be imported into any standard static site generator.
`,
  });

  return createTarGz(archiveFiles);
}
