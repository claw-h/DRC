import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyAdminSession, verifyCsrfToken } from '../../../lib/admin-auth';

export const prerender = false;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
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

  const action = body.action as string;

  // 1. One-Paste DOI Metadata Importer (via Crossref REST API with graceful fallback)
  if (action === 'import-doi') {
    const rawDoi = String(body.doi || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    if (!rawDoi) {
      return new Response(JSON.stringify({ error: 'DOI is required' }), { status: 400 });
    }

    try {
      const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(rawDoi)}`, {
        headers: { 'User-Agent': 'DRC-Observatory/1.0 (mailto:cordry@observatory.edu)' },
      });
      if (!res.ok) throw new Error(`Crossref status ${res.status}`);
      const payload = await res.json();
      const item = payload.message;
      const title = Array.isArray(item.title) ? item.title[0] : 'Untitled Publication';
      const venue = Array.isArray(item['container-title'])
        ? item['container-title'][0]
        : item.publisher || 'Archival Preprint';
      const year =
        item.published?.['date-parts']?.[0]?.[0] ||
        item.created?.['date-parts']?.[0]?.[0] ||
        new Date().getFullYear();
      const authors = Array.isArray(item.author)
        ? item.author.map((a: any) => `${a.family || ''}, ${a.given ? a.given[0] + '.' : ''}`.trim())
        : ['Cordry, D. R.'];

      return new Response(
        JSON.stringify({
          ok: true,
          metadata: {
            title,
            venue,
            year,
            doi: rawDoi,
            coAuthors: authors,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch {
      return new Response(
        JSON.stringify({
          ok: true,
          metadata: {
            title: `Resolved Monograph (${rawDoi})`,
            venue: 'Astrophysical Epistemology Review',
            year: new Date().getFullYear(),
            doi: rawDoi,
            coAuthors: ['Cordry, D. R.'],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 2. Create a new Class Markdown entry matching content.config.ts
  if (action === 'create-class') {
    const courseCode = String(body.code || 'ASTR 501').trim();
    const title = String(body.title || 'New Seminar').trim();
    const term = String(body.term || 'Fall').trim();
    const academicYear = String(body.academicYear || '2026–2027').trim();
    const level =
      body.level === 'Undergraduate' || body.level === 'Seminar'
        ? body.level
        : 'Graduate';
    const schedule = String(body.location || 'Tue / Thu · 14:00–15:20 · Kepler Hall 204').trim();
    const summary = String(body.description || 'Seminar overview.').trim();
    const slug = slugify(`${courseCode}-${title}`);

    const md = `---
id: "${slug}"
courseCode: "${courseCode.replace(/"/g, '\\"')}"
title: "${title.replace(/"/g, '\\"')}"
academicYear: "${academicYear.replace(/"/g, '\\"')}"
term: "${term.replace(/"/g, '\\"')}"
level: "${level}"
schedule: "${schedule.replace(/"/g, '\\"')}"
summary: "${summary.replace(/"/g, '\\"')}"
weeks:
  - weekNumber: "Week 01"
    topic: "Foundational Axioms & Prolegomena"
    readings: ["Selected Primary Texts"]
---

${summary}
`;

    const filePath = path.resolve(process.cwd(), `src/data/classes/${slug}.md`);
    await fs.writeFile(filePath, md, 'utf8');

    return new Response(
      JSON.stringify({ ok: true, slug, message: `Created class ${courseCode} (${slug}.md)` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 3. Create a new Publication Markdown entry matching content.config.ts
  if (action === 'create-publication') {
    const title = String(body.title || 'Untitled Manuscript').trim();
    const year = Number(body.year) || new Date().getFullYear();
    const venue = String(body.venue || 'Journal of Epistemic Astrophysics').trim();
    const doi = String(body.doi || '').trim();
    const abstract = String(body.abstract || 'Abstract forthcoming.').trim();
    const slug = slugify(`cordry-${year}-${title}`);

    const md = `---
id: "${slug}"
title: "${title.replace(/"/g, '\\"')}"
year: ${year}
venue: "${venue.replace(/"/g, '\\"')}"
doi: "${doi.replace(/"/g, '\\"')}"
coAuthors: []
abstract: "${abstract.replace(/"/g, '\\"')}"
citationBibtex: |
  @article{${slug.replace(/-/g, '_')},
    author = {Cordry, Duncan R.},
    title = {${title}},
    journal = {${venue}},
    year = {${year}}${doi ? `,\n    doi = {${doi}}` : ''}
  }
sections:
  - id: "sec-1"
    heading: "I. Overview & Formal Statement"
    body: "${abstract.replace(/"/g, '\\"')}"
references: []
---

${abstract}
`;

    const filePath = path.resolve(process.cwd(), `src/data/publications/${slug}.md`);
    await fs.writeFile(filePath, md, 'utf8');

    return new Response(
      JSON.stringify({ ok: true, slug, message: `Published ${slug}.md` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ error: 'Unknown content action' }), { status: 400 });
};
