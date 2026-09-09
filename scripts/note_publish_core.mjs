import { access, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRAFTS_ROOT = join(PROJECT_ROOT, "articles", "drafts");
const PUBLISHED_ROOT = join(PROJECT_ROOT, "articles", "published");
const STATE_PATH = join(PROJECT_ROOT, "articles", "state.json");

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseArticle(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error("Article must start with YAML frontmatter enclosed by --- lines");
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (field) metadata[field[1]] = unquote(field[2]);
  }
  if (!metadata.title) throw new Error("Article frontmatter is missing title");
  if (metadata.status !== "draft") throw new Error(`Article status must be draft, got ${metadata.status || "missing"}`);
  return { metadata, body: match[2].trim() };
}

async function safeFile(inputPath, allowedRoot) {
  const candidate = isAbsolute(inputPath) ? resolve(inputPath) : resolve(PROJECT_ROOT, inputPath);
  const actual = await realpath(candidate);
  const root = await realpath(allowedRoot);
  const rel = relative(root, actual);
  if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new Error(`Path must be inside ${relative(PROJECT_ROOT, root)}`);
  }
  return actual;
}

function mimeFor(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  throw new Error(`Unsupported image extension: ${extension || "none"}`);
}

export async function preparePublication({
  draftPath,
  eyecatchPath,
  isPublish = true,
  userApproved = false,
  hashtags = [],
  price = 0,
  magazineKeys = [],
}) {
  const articlePath = await safeFile(draftPath, DRAFTS_ROOT);
  if (articlePath.endsWith(".seo-brief.md")) throw new Error("SEO brief files cannot be published");
  const eyecatch = await safeFile(eyecatchPath, join(DRAFTS_ROOT, "images"));
  const { metadata, body } = parseArticle(await readFile(articlePath, "utf8"));

  const state = JSON.parse(await readFile(STATE_PATH, "utf8"));
  const articleRelative = relative(PROJECT_ROOT, articlePath).split(sep).join("/");
  const existingRemoteDraft = (state.drafts || []).find(
    (item) => (item.file === articleRelative || item.title === metadata.title) && item.note_id
  );
  if (existingRemoteDraft) {
    throw new Error(
      `This article already has a note.com draft (${existingRemoteDraft.note_url || existingRemoteDraft.note_id}); refusing to create a duplicate`
    );
  }

  if (isPublish) {
    const archivePath = join(PUBLISHED_ROOT, basename(articlePath));
    try {
      await access(archivePath);
      throw new Error(`Published archive already exists: ${relative(PROJECT_ROOT, archivePath)}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  if (!Array.isArray(hashtags) || hashtags.some((value) => typeof value !== "string")) {
    throw new Error("hashtags must be an array of strings");
  }
  if (!Array.isArray(magazineKeys) || magazineKeys.some((value) => typeof value !== "string")) {
    throw new Error("magazineKeys must be an array of strings");
  }
  if (!Number.isFinite(price) || price < 0) throw new Error("price must be a non-negative number");

  if (isPublish && !userApproved) {
    const briefPath = articlePath.replace(/\.md$/, ".seo-brief.md");
    let brief = "";
    try {
      brief = await readFile(briefPath, "utf8");
    } catch {
      // A user-approved article may omit a brief; unapproved articles may not.
    }
    const hasPhase7 = /##\s*Phase\s*7[：:]?[\s\S]*(指摘事項なし|反映済み)/i.test(brief);
    if (!hasPhase7) {
      throw new Error("Live publication requires a completed Phase 7 audit or userApproved=true");
    }
  }

  const images = [];
  const imagePattern = /!\[[^\]]*\]\(([^)]+)\)/g;
  const seen = new Set();
  for (const match of body.matchAll(imagePattern)) {
    const reference = match[1].trim();
    if (/^(https?:|data:)/i.test(reference)) {
      throw new Error(`Remote/data image references are not supported: ${reference}`);
    }
    if (seen.has(reference)) continue;
    seen.add(reference);
    const imagePath = await safeFile(resolve(dirname(articlePath), reference), DRAFTS_ROOT);
    images.push({ path: reference, base64: await readFile(imagePath, "base64"), mime: mimeFor(imagePath) });
  }

  return {
    articlePath,
    metadata,
    options: {
      title: metadata.title,
      markdown: body,
      images,
      eyecatch: { base64: await readFile(eyecatch, "base64"), mime: mimeFor(eyecatch) },
      hashtags,
      price,
      magazineKeys,
      isPublish,
    },
  };
}

async function atomicJsonWrite(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export async function recordPublication(prepared, noteData) {
  const state = JSON.parse(await readFile(STATE_PATH, "utf8"));
  const now = new Date().toISOString();
  const oldRelative = relative(PROJECT_ROOT, prepared.articlePath).split(sep).join("/");
  let finalPath = prepared.articlePath;
  let finalRelative = oldRelative;

  if (noteData.mode === "published") {
    await mkdir(PUBLISHED_ROOT, { recursive: true });
    finalPath = join(PUBLISHED_ROOT, basename(prepared.articlePath));
    await rename(prepared.articlePath, finalPath);
    finalRelative = relative(PROJECT_ROOT, finalPath).split(sep).join("/");
  }

  const previous = (state.drafts || []).find((item) => item.file === oldRelative || item.title === prepared.metadata.title) || {};
  state.drafts = (state.drafts || []).filter((item) => item.file !== oldRelative && item.title !== prepared.metadata.title);

  const record = {
    ...previous,
    file: finalRelative,
    title: prepared.metadata.title,
    note_url: noteData.mode === "published" ? noteData.publicUrl : noteData.editUrl,
    note_id: noteData.noteId,
    note_key: noteData.noteKey,
    is_publish: noteData.mode === "published",
    at: now,
  };

  if (noteData.mode === "published") {
    state.published = [...(state.published || []).filter((item) => item.note_key !== noteData.noteKey), record];
    const duplicateTopic = (state.topic_history || []).some((item) => item.title === prepared.metadata.title);
    if (!duplicateTopic) {
      state.topic_history = [...(state.topic_history || []), { title: prepared.metadata.title, topic_id: null, kw: previous.kw, at: now }];
    }
  } else {
    state.drafts.push(record);
  }
  state.last_run_at = now;
  await atomicJsonWrite(STATE_PATH, state);
  return { record, archivedTo: noteData.mode === "published" ? finalPath : null };
}
