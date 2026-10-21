export const prerender = false;

import type { APIRoute } from 'astro';
import { loadObservatoryWorkspaceData } from '../../lib/turso';

const tex = (value: unknown) => String(value ?? '').replace(/[\\{}#$%&_~^]/g, (char) => ({
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  '#': '\\#',
  '$': '\\$',
  '%': '\\%',
  '&': '\\&',
  '_': '\\_',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
}[char] || char))
  .replace(/[–—·§‘’“”…−]/g, (char) => ({
    '–': '--',
    '—': '---',
    '·': '$\\cdot$',
    '§': '\\S{}',
    '‘': '`',
    '’': "'",
    '“': '``',
    '”': "''",
    '…': '\\ldots{}',
    '−': '-',
  }[char] || char));

const section = (title: string, entries: string[]) => entries.length
  ? `\\section*{${tex(title)}}\n\\begin{itemize}[leftmargin=*,itemsep=3pt,topsep=3pt]\n${entries.map((entry) => `\\item ${entry}`).join('\n')}\n\\end{itemize}\n`
  : '';

export const GET: APIRoute = async ({ request }) => {
  const { publications, books, classes, profile } = await loadObservatoryWorkspaceData();
  const mode = new URL(request.url).searchParams.get('mode') === 'long' ? 'long' : 'short';
  const sortedPublications = [...publications].sort((a, b) => b.data.year - a.data.year);
  const sortedBooks = [...books].sort((a, b) => b.data.year - a.data.year);
  const sortedClasses = [...classes].sort((a, b) => String(b.data.academicYear).localeCompare(String(a.data.academicYear)));
  const pubEntries = (mode === 'short' ? sortedPublications.slice(0, 3) : sortedPublications).map(({ data: pub }) => {
    const authors = [profile.name, ...(pub.coAuthors || [])].map(tex).join(', ');
    const title = tex(`${pub.title}${pub.subtitle ? `: ${pub.subtitle}` : ''}`);
    const volumeIssue = pub.volumeIssue ? ', ' + tex(pub.volumeIssue) : '';
    const doi = pub.doi ? ' DOI: ' + tex(pub.doi) + '.' : '';
    return `${authors} (${tex(pub.year)}.) \\emph{${title}}. \\emph{${tex(pub.venue)}}${volumeIssue}.${doi}`;
  });
  const bookEntries = (mode === 'short' ? sortedBooks.slice(0, 2) : sortedBooks).map(({ data: book }) => {
    const title = tex(book.title + (book.subtitle ? ': ' + book.subtitle : ''));
    return `\\textbf{${title}.} ${tex(book.publisher)}, ${tex(book.year)}. ${tex(book.pages)} pp. ISBN: ${tex(book.isbn)}.`;
  });
  const classEntries = (mode === 'short' ? sortedClasses.slice(0, 3) : sortedClasses).map(({ data: cls }) =>
    `\\textbf{${tex(cls.courseCode)} --- ${tex(cls.title)}.} ${tex(cls.term)} ${tex(cls.academicYear)} (${tex(cls.level)}).`,
  );

  const longSections = mode === 'long' ?
    section('Academic Appointments and Education', [
      '\\textbf{' + tex('Visiting Faculty of Philosophy') + ',} ' + tex('Department of Philosophy') + ', \\emph{' + tex('Ashoka University') + '}, ' + tex('Sonipat, India') + '.',
      '\\textbf{' + tex('Ph.D. in Philosophy') + ',} ' + tex('Purdue University') + ', ' + tex('West Lafayette, Indiana, USA') + '. Dissertation: ``' + tex('Spirituality at the End of the World: An Essay on Technology, Transindividuation and Orientation in the Light of Pharmacology and Insurrection') + "''." ,
    ]) +
    section('Areas of Specialization and Competence', [
      '\\textbf{Areas of Specialization:} ' + tex((profile.aos || []).join('; ')) + '.',
      '\\textbf{Areas of Competence:} ' + tex((profile.aoc || []).join('; ')) + '.',
    ]) +
    section('Honors, Fellowships, and Distinctions', (profile.awards || []).map((award: string) => tex(award)))
    : '';

  const contactUrl = profile.ashokaProfileUrl ? `\\\\\n\\url{${String(profile.ashokaProfileUrl).replace(/([#%])/g, '\\$1')}}` : '';
  const source = String.raw`\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage[letterpaper,margin=0.78in]{geometry}
\usepackage{microtype}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{titlesec}
\setlength{\parindent}{0pt}
\setlength{\parskip}{5pt}
\titleformat{\section}{\large\bfseries}{}{0pt}{}[\titlerule]
\pagestyle{plain}
\begin{document}
{\LARGE ${tex(profile.name)}\par}
\vspace{3pt}
${tex(profile.title)}\\
${tex(profile.department)} --- ${tex(profile.institution)}\\
${tex(profile.email)}${contactUrl}

${mode === 'short' ? `\\section*{Research Profile}\n${tex(profile.bio)}\n\n\\textbf{Research areas:} ${tex((profile.aos || []).join('; '))}.\n` : `\\section*{Research Profile}\n${tex(profile.bio)}\n`}
${longSections}
${section('Books and Monographs', bookEntries)}
${section(mode === 'short' ? 'Selected Publications' : 'Publications', pubEntries)}
${section('Teaching', classEntries)}
\end{document}
`;

  const filename = `${String(profile.name || 'academic-cv').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${mode}-cv.tex`;
  return new Response(source, {
    headers: {
      'Content-Type': 'application/x-tex; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=86400',
    },
  });
};
