import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyAdminSession, verifyCsrfToken } from '../../../lib/admin-auth.ts';

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

  // 3. Create or Update Publication Markdown
  if (action === 'create-publication') {
    const title = String(body.title || '').trim();
    if (!title) {
      return new Response(JSON.stringify({ error: 'Title is required' }), { status: 400 });
    }

    const year = Number(body.year) || new Date().getFullYear();
    const venue = String(body.venue || 'Philosophy of Technology').trim();
    const subtitle = body.subtitle ? String(body.subtitle).trim() : '';
    const volumeIssue = body.volumeIssue ? String(body.volumeIssue).trim() : '';
    const doi = String(body.doi || '').trim();
    const pdfUrl = body.pdfUrl ? String(body.pdfUrl).trim() : '';
    const abstract = String(body.abstract || 'Abstract forthcoming.').trim();

    let coAuthors: string[] = [];
    if (Array.isArray(body.coAuthors)) {
      coAuthors = body.coAuthors.map((a: any) => String(a).trim()).filter(Boolean);
    } else if (typeof body.coAuthors === 'string' && body.coAuthors.trim()) {
      coAuthors = body.coAuthors.split(',').map((a: string) => a.trim()).filter(Boolean);
    }

    const slug = slugify(`cordry-${year}-${title}`);
    const citationBibtex = String(body.citationBibtex || `@article{${slug.replace(/-/g, '_')},
  author = {Cordry, Duncan R.},
  title = {${title}},
  journal = {${venue}},
  year = {${year}}
}`);

    const mdContent = `---
id: "${slug}"
title: ${JSON.stringify(title)}
${subtitle ? `subtitle: ${JSON.stringify(subtitle)}\n` : ''}year: ${year}
venue: ${JSON.stringify(venue)}
${volumeIssue ? `volumeIssue: ${JSON.stringify(volumeIssue)}\n` : ''}coAuthors: ${JSON.stringify(coAuthors)}
abstract: ${JSON.stringify(abstract)}
${doi ? `doi: ${JSON.stringify(doi)}\n` : ''}${pdfUrl ? `pdfUrl: ${JSON.stringify(pdfUrl)}\n` : ''}citationBibtex: |
${citationBibtex.split('\n').map((l) => '  ' + l).join('\n')}
sections:
  - id: "sec-1"
    heading: "I. Overview & Foundational Statement"
    body: ${JSON.stringify(abstract)}
references: []
---

${abstract}
`;

    const outPath = path.resolve(process.cwd(), `src/data/publications/${slug}.md`);
    await fs.writeFile(outPath, mdContent, 'utf8');

    return new Response(
      JSON.stringify({ ok: true, slug, message: `Committed manuscript "${title}" (${slug}.md) to publications collection.` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 4. Create or Update Monograph / Book Markdown
  if (action === 'create-book') {
    const title = String(body.title || '').trim();
    if (!title) {
      return new Response(JSON.stringify({ error: 'Book title is required' }), { status: 400 });
    }

    const subtitle = body.subtitle ? String(body.subtitle).trim() : '';
    const year = Number(body.year) || new Date().getFullYear();
    const publisher = String(body.publisher || 'Ashoka University · Philosophy Monograph').trim();
    const isbn = String(body.isbn || `ASHOKA-PHIL-${year}-DRC`).trim();
    const pages = Number(body.pages) || 200;
    const coverImage = String(body.coverImage || '/images/books/celestial-mechanics.svg').trim();
    const synopsis = String(body.synopsis || '').trim();

    const chapters = Array.isArray(body.chapters) ? body.chapters : [
      { number: '01', title: 'Foundational Epistemologies', summary: 'Introduction to primary technical and ontological frameworks.' }
    ];

    const endorsements = Array.isArray(body.endorsements) ? body.endorsements : [];
    const purchaseLinks = Array.isArray(body.purchaseLinks) && body.purchaseLinks.length ? body.purchaseLinks : [
      { label: 'Ashoka Faculty Profile', url: 'https://www.ashoka.edu.in/profile/duncan-cordry/' }
    ];

    const slug = slugify(`book-${title}-${year}`);

    const mdContent = `---
id: "${slug}"
title: ${JSON.stringify(title)}
${subtitle ? `subtitle: ${JSON.stringify(subtitle)}\n` : ''}year: ${year}
publisher: ${JSON.stringify(publisher)}
isbn: ${JSON.stringify(isbn)}
pages: ${pages}
coverImage: ${JSON.stringify(coverImage)}
synopsis: ${JSON.stringify(synopsis)}
endorsements: ${JSON.stringify(endorsements, null, 2).replace(/\n/g, '\n')}
chapters: ${JSON.stringify(chapters, null, 2).replace(/\n/g, '\n')}
purchaseLinks: ${JSON.stringify(purchaseLinks, null, 2).replace(/\n/g, '\n')}
---

${synopsis}
`;

    const outPath = path.resolve(process.cwd(), `src/data/books/${slug}.md`);
    await fs.writeFile(outPath, mdContent, 'utf8');

    return new Response(
      JSON.stringify({ ok: true, slug, message: `Published book monograph "${title}" (${slug}.md).` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 5. Create or Update Class Markdown
  if (action === 'create-class') {
    const courseCode = String(body.code || 'PHIL 3050').trim().toUpperCase();
    const title = String(body.title || 'Philosophy Seminar').trim();
    const term = String(body.term || 'Monsoon').trim();
    const academicYear = String(body.academicYear || '2025–2026').trim();
    const level = ['Undergraduate', 'Graduate', 'Seminar'].includes(body.level) ? body.level : 'Seminar';
    const schedule = String(body.location || 'Ashoka University · Department of Philosophy').trim();
    const syllabusPdf = body.syllabusPdf ? String(body.syllabusPdf).trim() : undefined;
    const summary = String(body.description || '').trim();

    let weeks: Array<{ weekNumber: string; topic: string; readings: string[] }> = [];
    if (Array.isArray(body.weeks) && body.weeks.length > 0) {
      weeks = body.weeks.map((w: any) => ({
        weekNumber: String(w.weekNumber || 'WK 01').trim(),
        topic: String(w.topic || 'General Lecture & Discussion').trim(),
        readings: Array.isArray(w.readings)
          ? w.readings.map(String)
          : typeof w.readings === 'string'
            ? w.readings.split('\n').map((r: string) => r.trim()).filter(Boolean)
            : ['Selected Primary Seminar Texts'],
      }));
    } else {
      weeks = [
        {
          weekNumber: 'WK 01',
          topic: 'Foundations & Prolegomena',
          readings: ['Selected Primary Seminar Texts'],
        },
      ];
    }

    const slug = slugify(`${courseCode}-${title}`);

    const mdContent = `---
id: "${slug}"
courseCode: ${JSON.stringify(courseCode)}
title: ${JSON.stringify(title)}
academicYear: ${JSON.stringify(academicYear)}
term: ${JSON.stringify(term)}
level: "${level}"
schedule: ${JSON.stringify(schedule)}
${syllabusPdf ? `syllabusPdf: ${JSON.stringify(syllabusPdf)}\n` : ''}summary: ${JSON.stringify(summary)}
weeks: ${JSON.stringify(weeks, null, 2)}
reviews: []
---

${summary}
`;

    const outPath = path.resolve(process.cwd(), `src/data/classes/${slug}.md`);
    await fs.writeFile(outPath, mdContent, 'utf8');

    return new Response(
      JSON.stringify({ ok: true, slug, message: `Published syllabus for ${courseCode} (${slug}.md).` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 6. Delete Content Record (Publications, Books, Classes)
  if (action === 'delete-content') {
    const type = String(body.type || '');
    const id = String(body.id || '').trim();

    if (!['publications', 'books', 'classes'].includes(type)) {
      return new Response(JSON.stringify({ error: 'Invalid content type' }), { status: 400 });
    }

    // Sanitize ID
    const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanId) {
      return new Response(JSON.stringify({ error: 'Valid item ID is required' }), { status: 400 });
    }

    const filePath = path.resolve(process.cwd(), `src/data/${type}/${cleanId}.md`);
    try {
      await fs.unlink(filePath);
      return new Response(
        JSON.stringify({ ok: true, deletedId: cleanId, type, message: `Removed ${cleanId}.md from ${type}.` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch {
      return new Response(JSON.stringify({ error: `File not found for ID ${cleanId}` }), { status: 404 });
    }
  }

  return new Response(JSON.stringify({ error: 'Unknown content action' }), { status: 400 });
};
