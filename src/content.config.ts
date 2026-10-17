import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const publications = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/data/publications' }),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    subtitle: z.string().optional(),
    year: z.number().int(),
    venue: z.string(),
    volumeIssue: z.string().optional(),
    coAuthors: z.array(z.string()).default([]),
    abstract: z.string(),
    doi: z.string().optional(),
    pdfUrl: z.string().optional(),
    citationBibtex: z.string(),
    sections: z.array(z.object({
      id: z.string(),
      heading: z.string(),
      body: z.string(),
    })).default([]),
    references: z.array(z.object({
      num: z.number().int(),
      citation: z.string(),
      doiUrl: z.string().optional(),
      note: z.string().optional(),
    })).default([]),
  }),
});

const books = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/data/books' }),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    subtitle: z.string().optional(),
    year: z.number().int(),
    publisher: z.string(),
    isbn: z.string(),
    pages: z.number().int(),
    coverImage: z.string(),
    synopsis: z.string(),
    endorsements: z.array(z.object({
      quote: z.string(),
      sourceTitle: z.string(),
      citeUrl: z.string().optional(),
    })).default([]),
    chapters: z.array(z.object({
      number: z.string(),
      title: z.string(),
      summary: z.string(),
    })).default([]),
    purchaseLinks: z.array(z.object({
      label: z.string(),
      url: z.string(),
    })).default([]),
  }),
});

const classes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/data/classes' }),
  schema: z.object({
    id: z.string(),
    courseCode: z.string(),
    title: z.string(),
    academicYear: z.string(),
    term: z.string(),
    level: z.enum(['Undergraduate', 'Graduate', 'Seminar']),
    schedule: z.string(),
    syllabusPdf: z.string().optional(),
    summary: z.string(),
    weeks: z.array(z.object({
      weekNumber: z.string(),
      topic: z.string(),
      readings: z.array(z.string()),
    })).default([]),
  }),
});

export const collections = { publications, books, classes };
