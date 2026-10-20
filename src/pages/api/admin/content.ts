import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { verifyAdminSession, verifyCsrfToken } from '../../../lib/admin-auth.ts';
import {
  persistPublicationToDb,
  deletePublicationFromDb,
  persistBookToDb,
  deleteBookFromDb,
  persistClassToDb,
  deleteClassFromDb,
  fetchContentRecordFromDb,
} from '../../../lib/turso.ts';

export const prerender = false;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
}

function cleanAbstract(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<jats:[^>]+>/gi, '')
    .replace(/<\/jats:[^>]+>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function parseBibTeXFields(raw: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*([a-zA-Z_-]+)\s*=\s*[{"]?(.*?)[}"]?,?\s*$/);
    if (match) {
      const key = match[1].toLowerCase();
      let val = match[2].trim();
      val = val.replace(/^[{"']|['"}]$/g, '').trim();
      fields[key] = val;
    }
  }
  return fields;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!verifyAdminSession(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json().catch(() => ({}));
  if (!verifyCsrfToken(cookies, String(body.csrfToken || ''))) {
    return new Response(JSON.stringify({ error: 'Invalid CSRF token' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const action = String(body.action || '');

  // 1. One-Paste Crossref DOI Metadata Ingestion
  if (action === 'import-doi') {
    const rawDoi = String(body.doi || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    if (!rawDoi) {
      return new Response(JSON.stringify({ error: 'DOI is required' }), { status: 400 });
    }

    try {
      const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(rawDoi)}`, {
        headers: { 'User-Agent': 'DRC-Observatory/2.0 (mailto:duncan.cordry@ashoka.edu.in)' },
      });
      if (!res.ok) throw new Error(`Crossref status ${res.status}`);
      const payload = await res.json();
      const item = payload.message;

      const title = Array.isArray(item.title) ? item.title[0] : (item.title || 'Untitled Manuscript');
      const subtitle = Array.isArray(item.subtitle) && item.subtitle.length ? item.subtitle[0] : undefined;
      const venue = Array.isArray(item['container-title']) && item['container-title'].length
        ? item['container-title'][0]
        : (item.publisher || 'Academic Journal / Monograph');
      const year =
        item.published?.['date-parts']?.[0]?.[0] ||
        item.created?.['date-parts']?.[0]?.[0] ||
        new Date().getFullYear();

      const authors = Array.isArray(item.author)
        ? item.author.map((a: any) => `${a.family || ''}, ${a.given ? a.given[0] + '.' : ''}`.trim())
        : ['Cordry, D. R.'];

      const vol = item.volume ? `Vol. ${item.volume}` : '';
      const iss = item.issue ? `Issue ${item.issue}` : '';
      const volumeIssue = [vol, iss].filter(Boolean).join(', ') || undefined;
      const abstract = cleanAbstract(item.abstract || '');

      const bibtexKey = `cordry_${year}_${slugify(title).slice(0, 24).replace(/-/g, '_')}`;
      const citationBibtex = `@article{${bibtexKey},
  author = {${authors.join(' and ')}},
  title = {${title}},
  journal = {${venue}},
  year = {${year}}${rawDoi ? `,\n  doi = {${rawDoi}}` : ''}${volumeIssue ? `,\n  volume = {${item.volume || ''}}` : ''}
}`;

      return new Response(
        JSON.stringify({
          ok: true,
          metadata: {
            title,
            subtitle,
            venue,
            year: Number(year),
            doi: rawDoi,
            coAuthors: authors,
            volumeIssue,
            abstract,
            citationBibtex,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: `Could not retrieve DOI metadata: ${err?.message || 'Crossref unreachable'}. You may fill fields manually or paste BibTeX.`,
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 2. BibTeX Text / File Ingestion Parser
  if (action === 'parse-bibtex') {
    const rawBib = String(body.bibtex || '').trim();
    if (!rawBib) {
      return new Response(JSON.stringify({ error: 'BibTeX source string is required' }), { status: 400 });
    }

    const fields = parseBibTeXFields(rawBib);
    const title = fields.title || 'Untitled Manuscript';
    const venue = fields.journal || fields.booktitle || fields.publisher || 'Academic Venue';
    const year = Number(fields.year) || new Date().getFullYear();
    const doi = fields.doi || '';
    const abstract = cleanAbstract(fields.abstract || '');

    let authors: string[] = [];
    if (fields.author) {
      authors = fields.author.split(/\s+and\s+/i).map((a) => a.trim());
    }

    const vol = fields.volume ? `Vol. ${fields.volume}` : '';
    const num = fields.number ? `No. ${fields.number}` : '';
    const volumeIssue = [vol, num].filter(Boolean).join(', ') || undefined;

    return new Response(
      JSON.stringify({
        ok: true,
        metadata: {
          title,
          venue,
          year,
          doi,
          coAuthors: authors,
          volumeIssue,
          abstract,
          citationBibtex: rawBib,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2b. One-Stop ISBN Metadata Resolver for Monographs
  if (action === 'resolve-isbn') {
    const rawIsbn = String(body.isbn || '').trim().replace(/[^0-9Xx]/g, '');
    if (!rawIsbn) {
      return new Response(JSON.stringify({ error: 'Valid ISBN is required' }), { status: 400 });
    }

    try {
      const res = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(rawIsbn)}.json`, {
        headers: { 'User-Agent': 'DRC-Observatory/2.0 (mailto:duncan.cordry@ashoka.edu.in)' },
      });
      if (!res.ok) throw new Error(`OpenLibrary status ${res.status}`);
      const data = await res.json();
      const title = data.title || 'Untitled Monograph';
      const subtitle = data.subtitle || undefined;
      const publishers = Array.isArray(data.publishers) ? data.publishers.join(', ') : (data.publishers || 'Academic Press');
      const year = data.publish_date ? parseInt(data.publish_date.match(/\b(19|20)\d{2}\b/)?.[0] || '2026', 10) : 2026;
      const pages = Number(data.number_of_pages) || 200;

      let synopsis = '';
      if (typeof data.description === 'string') synopsis = data.description;
      else if (data.description && typeof data.description.value === 'string') synopsis = data.description.value;

      return new Response(
        JSON.stringify({
          ok: true,
          metadata: {
            title,
            subtitle,
            publisher: publishers,
            year,
            pages,
            isbn: rawIsbn,
            synopsis: synopsis || 'Synopsis forthcoming.',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: `Could not retrieve ISBN metadata: ${err?.message || 'OpenLibrary unreachable'}. You may fill fields directly.`,
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 2c. Direct Document Upload (PDF Papers & Course Syllabi)
  if (action === 'upload-document') {
    const docType = String(body.type || 'publications');
    const dataUrl = String(body.dataUrl || '');
    const originalName = String(body.fileName || 'manuscript.pdf').trim();

    if (!dataUrl.startsWith('data:')) {
      return new Response(JSON.stringify({ error: 'Valid file data URL is required' }), { status: 400 });
    }

    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return new Response(JSON.stringify({ error: 'Malformed file payload' }), { status: 400 });
    }

    const mime = matches[1].toLowerCase();
    const buffer = Buffer.from(matches[2], 'base64');

    let ext = 'pdf';
    if (mime.includes('markdown') || originalName.endsWith('.md')) ext = 'md';
    else if (mime.includes('epub') || originalName.endsWith('.epub')) ext = 'epub';

    const subDir = docType === 'classes' ? 'syllabi' : 'papers';
    const targetDir = path.resolve(process.cwd(), `public/${subDir}`);
    await fs.mkdir(targetDir, { recursive: true });

    const baseName = slugify(originalName.replace(/\.[^/.]+$/, '')) || 'document';
    const fileName = `${baseName}-${Date.now().toString().slice(-4)}.${ext}`;
    const outPath = path.resolve(targetDir, fileName);

    await fs.writeFile(outPath, buffer);
    const fileUrl = `/${subDir}/${fileName}`;

    return new Response(
      JSON.stringify({
        ok: true,
        fileUrl,
        fileName,
        sizeBytes: buffer.length,
        message: `Successfully uploaded document to ${fileUrl}`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2d. Direct Inline Book Cover Upload
  if (action === 'upload-book-cover') {
    const dataUrl = String(body.dataUrl || '');
    if (!dataUrl.startsWith('data:image/')) {
      return new Response(JSON.stringify({ error: 'Valid image data URL required for book cover' }), { status: 400 });
    }

    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches) {
      return new Response(JSON.stringify({ error: 'Malformed image data' }), { status: 400 });
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const rawName = String(body.customFileName || 'monograph-cover').trim();
    const slugName = slugify(rawName) || 'monograph-cover';
    const fileName = `${slugName}-${Date.now().toString().slice(-4)}.${ext}`;

    const booksDir = path.resolve(process.cwd(), 'public/images/books');
    await fs.mkdir(booksDir, { recursive: true });

    const outPath = path.resolve(booksDir, fileName);
    await fs.writeFile(outPath, buffer);

    const imageUrl = `/images/books/${fileName}`;
    return new Response(
      JSON.stringify({
        ok: true,
        imageUrl,
        message: `Saved monograph cover to ${imageUrl}`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2e. Atomic Update of Existing Book Cover
  if (action === 'update-book-cover') {
    const bookId = String(body.bookId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const dataUrl = String(body.dataUrl || '');
    if (!bookId) {
      return new Response(JSON.stringify({ error: 'Book ID is required' }), { status: 400 });
    }
    if (!dataUrl.startsWith('data:image/')) {
      return new Response(JSON.stringify({ error: 'Valid image data URL required for book cover' }), { status: 400 });
    }

    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches) {
      return new Response(JSON.stringify({ error: 'Malformed image data' }), { status: 400 });
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const rawName = String(body.customFileName || bookId).trim();
    const slugName = slugify(rawName) || bookId;
    const fileName = `${slugName}-${Date.now().toString().slice(-4)}.${ext}`;

    const booksDir = path.resolve(process.cwd(), 'public/images/books');
    await fs.mkdir(booksDir, { recursive: true });

    const outPath = path.resolve(booksDir, fileName);
    await fs.writeFile(outPath, buffer);

    const imageUrl = `/images/books/${fileName}`;

    // Read and update the markdown file
    const bookFile = path.resolve(process.cwd(), `src/data/books/${bookId}.md`);
    try {
      const raw = await fs.readFile(bookFile, 'utf8');
      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
      if (match) {
        const frontmatter = yaml.load(match[1]) as Record<string, any>;
        frontmatter.coverImage = imageUrl;
        const bodyContent = match[2] || '';
        const updatedMd = `---\n${yaml.dump(frontmatter, { lineWidth: -1 })}---\n${bodyContent}`;
        await fs.writeFile(bookFile, updatedMd, 'utf8');
      }
    } catch (err: any) {
      return new Response(JSON.stringify({ error: `Could not update book metadata: ${err.message}` }), { status: 500 });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        imageUrl,
        message: `Updated cover for book "${bookId}" to ${imageUrl}`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 3. Get Content Record (Publications, Books, Classes) for In-Situ Editing
  if (action === 'get-content') {
    const type = String(body.type || '');
    const cleanId = String(body.id || '').replace(/[^a-zA-Z0-9_-]/g, '');

    if (!['publications', 'books', 'classes'].includes(type) || !cleanId) {
      return new Response(JSON.stringify({ error: 'Valid content type and id are required' }), { status: 400 });
    }

    const filePath = path.resolve(process.cwd(), `src/data/${type}/${cleanId}.md`);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
      if (!match) {
        return new Response(JSON.stringify({ error: `Invalid markdown frontmatter format in ${cleanId}.md` }), { status: 422 });
      }

      const parsedData = yaml.load(match[1]) as Record<string, any>;
      const bodyContent = match[2]?.trim() || '';

      return new Response(
        JSON.stringify({
          ok: true,
          type,
          id: cleanId,
          data: parsedData,
          body: bodyContent,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch {
      // Fallback: Check Turso edge database
      const dbRecord = await fetchContentRecordFromDb(type as any, cleanId);
      if (dbRecord) {
        return new Response(
          JSON.stringify({
            ok: true,
            type,
            id: cleanId,
            data: dbRecord.data,
            body: dbRecord.body,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ error: `File not found: ${cleanId}.md in ${type}` }), { status: 404 });
    }
  }

  // 4. Create or Update Publication Markdown
  if (action === 'create-publication') {
    const title = String(body.title || '').trim();
    if (!title) {
      return new Response(JSON.stringify({ error: 'Title is required' }), { status: 400 });
    }

    const year = Number(body.year) || new Date().getFullYear();
    const venue = String(body.venue || 'Philosophy of Technology').trim();
    const subtitle = body.subtitle ? String(body.subtitle).trim() : undefined;
    const volumeIssue = body.volumeIssue ? String(body.volumeIssue).trim() : undefined;
    const doi = body.doi ? String(body.doi).trim() : undefined;
    const pdfUrl = body.pdfUrl ? String(body.pdfUrl).trim() : undefined;
    const abstract = String(body.abstract || 'Abstract forthcoming.').trim();

    let coAuthors: string[] = [];
    if (Array.isArray(body.coAuthors)) {
      coAuthors = body.coAuthors.map((a: any) => String(a).trim()).filter(Boolean);
    } else if (typeof body.coAuthors === 'string' && body.coAuthors.trim()) {
      coAuthors = body.coAuthors.split(',').map((a: string) => a.trim()).filter(Boolean);
    }

    const existingId = body.existingId ? String(body.existingId).replace(/[^a-zA-Z0-9_-]/g, '') : '';
    const slug = existingId || slugify(`cordry-${year}-${title}`);

    // If updating, preserve existing sections and references if present
    let sections: Array<{ id: string; heading: string; body: string }> = [
      { id: 'sec-1', heading: 'I. Overview & Foundational Statement', body: abstract },
    ];
    let references: any[] = [];

    if (existingId) {
      try {
        const oldFile = await fs.readFile(path.resolve(process.cwd(), `src/data/publications/${existingId}.md`), 'utf8');
        const oldMatch = oldFile.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
        if (oldMatch) {
          const oldData = yaml.load(oldMatch[1]) as any;
          if (Array.isArray(oldData?.sections) && oldData.sections.length > 0) {
            sections = oldData.sections;
          }
          if (Array.isArray(oldData?.references)) {
            references = oldData.references;
          }
        }
      } catch {}
    }

    const citationBibtex = String(
      body.citationBibtex ||
        `@article{${slug.replace(/-/g, '_')},\n  author = {Cordry, Duncan R.},\n  title = {${title}},\n  journal = {${venue}},\n  year = {${year}}\n}`
    ).trim();

    const frontmatter: Record<string, any> = {
      id: slug,
      title,
      ...(subtitle ? { subtitle } : {}),
      year,
      venue,
      ...(volumeIssue ? { volumeIssue } : {}),
      coAuthors,
      abstract,
      ...(doi ? { doi } : {}),
      ...(pdfUrl ? { pdfUrl } : {}),
      citationBibtex,
      sections,
      references,
    };

    // Persist to Turso Edge Database
    await persistPublicationToDb(frontmatter).catch(() => {});

    // Write to local disk if filesystem is writable
    try {
      const mdContent = `---\n${yaml.dump(frontmatter, { lineWidth: -1 })}---\n\n${abstract}\n`;
      const outPath = path.resolve(process.cwd(), `src/data/publications/${slug}.md`);
      await fs.writeFile(outPath, mdContent, 'utf8');
    } catch {}

    return new Response(
      JSON.stringify({
        ok: true,
        slug,
        item: frontmatter,
        message: existingId
          ? `Updated manuscript "${title}" (${slug}.md).`
          : `Committed manuscript "${title}" (${slug}.md) to publications collection.`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 5. Create or Update Monograph / Book Markdown
  if (action === 'create-book') {
    const title = String(body.title || '').trim();
    if (!title) {
      return new Response(JSON.stringify({ error: 'Book title is required' }), { status: 400 });
    }

    const subtitle = body.subtitle ? String(body.subtitle).trim() : undefined;
    const year = Number(body.year) || new Date().getFullYear();
    const publisher = String(body.publisher || 'Ashoka University · Philosophy Monograph').trim();
    const isbn = String(body.isbn || `ASHOKA-PHIL-${year}-DRC`).trim();
    const pages = Number(body.pages) || 200;
    const coverImage = String(body.coverImage || '/images/books/celestial-mechanics.svg').trim();
    const synopsis = String(body.synopsis || '').trim();

    const existingId = body.existingId ? String(body.existingId).replace(/[^a-zA-Z0-9_-]/g, '') : '';
    const slug = existingId || slugify(`book-${title}-${year}`);

    let chapters: Array<{ number: string; title: string; summary: string }> = [];
    if (Array.isArray(body.chapters) && body.chapters.length > 0) {
      chapters = body.chapters.map((ch: any, idx: number) => ({
        number: String(ch.number || String(idx + 1).padStart(2, '0')).trim(),
        title: String(ch.title || '').trim(),
        summary: String(ch.summary || '').trim(),
      })).filter((ch) => ch.title);
    }
    if (chapters.length === 0) {
      chapters = [
        { number: '01', title: 'Foundational Epistemologies', summary: 'Introduction to primary technical and ontological frameworks.' },
      ];
    }

    let endorsements: any[] = [];
    let purchaseLinks: any[] = [
      { label: 'Ashoka Faculty Profile', url: 'https://www.ashoka.edu.in/profile/duncan-cordry/' },
    ];

    if (existingId) {
      try {
        const oldFile = await fs.readFile(path.resolve(process.cwd(), `src/data/books/${existingId}.md`), 'utf8');
        const oldMatch = oldFile.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
        if (oldMatch) {
          const oldData = yaml.load(oldMatch[1]) as any;
          if (Array.isArray(oldData?.endorsements)) endorsements = oldData.endorsements;
          if (Array.isArray(oldData?.purchaseLinks) && oldData.purchaseLinks.length > 0) purchaseLinks = oldData.purchaseLinks;
        }
      } catch {}
    }

    const frontmatter: Record<string, any> = {
      id: slug,
      title,
      ...(subtitle ? { subtitle } : {}),
      year,
      publisher,
      isbn,
      pages,
      coverImage,
      synopsis,
      endorsements,
      chapters,
      purchaseLinks,
    };

    // Persist to Turso Edge Database
    await persistBookToDb(frontmatter).catch(() => {});

    // Write to local disk if filesystem is writable
    try {
      const mdContent = `---\n${yaml.dump(frontmatter, { lineWidth: -1 })}---\n\n${synopsis}\n`;
      const outPath = path.resolve(process.cwd(), `src/data/books/${slug}.md`);
      await fs.writeFile(outPath, mdContent, 'utf8');
    } catch {}

    return new Response(
      JSON.stringify({
        ok: true,
        slug,
        item: frontmatter,
        message: existingId
          ? `Updated monograph "${title}" (${slug}.md).`
          : `Published book monograph "${title}" (${slug}.md).`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 6. Create or Update Class Markdown
  if (action === 'create-class') {
    const courseCode = String(body.code || body.courseCode || 'PHIL 3050').trim().toUpperCase();
    const title = String(body.title || 'Philosophy Seminar').trim();
    const term = String(body.term || 'Monsoon').trim();
    const academicYear = String(body.academicYear || '2025–2026').trim();
    const level = ['Undergraduate', 'Graduate', 'Seminar'].includes(body.level) ? body.level : 'Seminar';
    const schedule = String(body.location || body.schedule || 'Ashoka University · Department of Philosophy').trim();
    const syllabusPdf = body.syllabusPdf ? String(body.syllabusPdf).trim() : undefined;
    const summary = String(body.description || body.summary || '').trim();

    const existingId = body.existingId ? String(body.existingId).replace(/[^a-zA-Z0-9_-]/g, '') : '';
    const slug = existingId || slugify(`${courseCode}-${title}`);

    let weeks: Array<{ weekNumber: string; topic: string; readings: string[] }> = [];
    if (Array.isArray(body.weeks) && body.weeks.length > 0) {
      weeks = body.weeks.map((w: any, idx: number) => ({
        weekNumber: String(w.weekNumber || `WK ${String(idx + 1).padStart(2, '0')}`).trim(),
        topic: String(w.topic || 'General Lecture & Discussion').trim(),
        readings: Array.isArray(w.readings)
          ? w.readings.map(String).map((r) => r.trim()).filter(Boolean)
          : typeof w.readings === 'string'
            ? w.readings.split('\n').map((r: string) => r.trim()).filter(Boolean)
            : ['Selected Primary Seminar Texts'],
      })).filter((w) => w.topic);
    }
    if (weeks.length === 0) {
      weeks = [
        {
          weekNumber: 'WK 01',
          topic: 'Foundations & Prolegomena',
          readings: ['Selected Primary Seminar Texts'],
        },
      ];
    }

    let reviews: any[] = [];
    if (existingId) {
      try {
        const oldFile = await fs.readFile(path.resolve(process.cwd(), `src/data/classes/${existingId}.md`), 'utf8');
        const oldMatch = oldFile.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
        if (oldMatch) {
          const oldData = yaml.load(oldMatch[1]) as any;
          if (Array.isArray(oldData?.reviews)) reviews = oldData.reviews;
        }
      } catch {}
    }

    const frontmatter: Record<string, any> = {
      id: slug,
      courseCode,
      title,
      academicYear,
      term,
      level,
      schedule,
      ...(syllabusPdf ? { syllabusPdf } : {}),
      summary,
      weeks,
      reviews,
    };

    // Persist to Turso Edge Database
    await persistClassToDb(frontmatter).catch(() => {});

    // Write to local disk if filesystem is writable
    try {
      const mdContent = `---\n${yaml.dump(frontmatter, { lineWidth: -1 })}---\n\n${summary}\n`;
      const outPath = path.resolve(process.cwd(), `src/data/classes/${slug}.md`);
      await fs.writeFile(outPath, mdContent, 'utf8');
    } catch {}

    return new Response(
      JSON.stringify({
        ok: true,
        slug,
        item: frontmatter,
        message: existingId
          ? `Updated syllabus for ${courseCode} (${slug}.md).`
          : `Published syllabus for ${courseCode} (${slug}.md).`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 7. Delete Content Record (Publications, Books, Classes)
  if (action === 'delete-content') {
    const type = String(body.type || '');
    const id = String(body.id || '').trim();

    if (!['publications', 'books', 'classes'].includes(type)) {
      return new Response(JSON.stringify({ error: 'Invalid content type' }), { status: 400 });
    }

    const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanId) {
      return new Response(JSON.stringify({ error: 'Valid item ID is required' }), { status: 400 });
    }

    // Remove from Turso Edge Database
    if (type === 'publications') await deletePublicationFromDb(cleanId).catch(() => {});
    if (type === 'books') await deleteBookFromDb(cleanId).catch(() => {});
    if (type === 'classes') await deleteClassFromDb(cleanId).catch(() => {});

    const filePath = path.resolve(process.cwd(), `src/data/${type}/${cleanId}.md`);
    try {
      await fs.unlink(filePath);
    } catch {}

    return new Response(
      JSON.stringify({ ok: true, deletedId: cleanId, type, message: `Permanently removed ${cleanId} from ${type}.` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ error: 'Unknown content action' }), { status: 400 });
};
