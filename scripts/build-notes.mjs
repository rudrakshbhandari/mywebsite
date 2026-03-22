import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

const repoRoot = process.cwd();
const contentDir = path.join(repoRoot, 'content', 'notes');
const outputRoot = process.argv[2] ? path.resolve(repoRoot, process.argv[2]) : repoRoot;
const outputPath = path.join(outputRoot, 'notes', 'notes-data.json');

marked.setOptions({
  gfm: true,
  breaks: false,
});

function slugify(input) {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString().slice(0, 10);
  }

  return '';
}

async function loadNotes() {
  const entries = await fs.readdir(contentDir, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });

  const notes = await Promise.all(
    entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(async entry => {
        const filePath = path.join(contentDir, entry.name);
        const raw = await fs.readFile(filePath, 'utf8');
        const { data, content } = matter(raw);
        const html = marked.parse(content.trim());
        const plainText = stripHtml(html);
        const slug = data.slug ? slugify(data.slug) : slugify(entry.name.replace(/\.md$/, ''));
        const hasExplicitSummary = typeof data.summary === 'string' && data.summary.trim().length > 0;
        const summary = hasExplicitSummary ? data.summary.trim() : plainText.slice(0, 180);
        const date = normalizeDate(data.date);

        return {
          slug,
          title: typeof data.title === 'string' ? data.title.trim() : slug,
          date,
          summary,
          hasExplicitSummary,
          tags: ensureArray(data.tags),
          featured: Boolean(data.featured),
          published: data.published !== false,
          html,
          readingTimeMinutes: Math.max(1, Math.ceil(plainText.split(/\s+/).filter(Boolean).length / 220)),
        };
      })
  );

  return notes
    .filter(note => note.published)
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
}

async function main() {
  const notes = await loadNotes();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        notes,
      },
      null,
      2
    )}\n`
  );
  console.log(`Generated ${notes.length} published notes at ${path.relative(repoRoot, outputPath)}`);
}

main().catch(error => {
  console.error('Failed to build notes data:', error);
  process.exitCode = 1;
});
