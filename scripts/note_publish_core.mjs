import { access, mkdir, readFile, realpath, rename, writeFile, copyFile, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
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
  if (/\[(要データ|要確認|要出典)(?:[：:][^\]]*)?\]/.test(body)) {
    throw new Error("Unresolved editorial tags must be resolved before saving or publishing");
  }
  const imageBytes = await readFile(eyecatch);
  if (extname(eyecatch).toLowerCase() === ".png" &&
      (imageBytes.length < 24 || imageBytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
       imageBytes.readUInt32BE(16) !== 1280 || imageBytes.readUInt32BE(20) !== 670)) {
    throw new Error("PNG eyecatch must be 1280x670");
  }

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
    const auditSection = brief.match(/^##\s*Phase\s*7(?=[：:\s]|$)[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/im)?.[1] || "";
    const hasPhase7 = /指摘事項なし|反映済み/.test(auditSection);
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
      eyecatch: { base64: imageBytes.toString("base64"), mime: mimeFor(eyecatch) },
      hashtags,
      price,
      magazineKeys,
      isPublish,
    },
  };
}

// Exclusive, durable journal: a CDP timeout may hide a successful remote write.
// Never remove this automatically or retry a write just because its reply was lost.
export async function beginPublicationAttempt(prepared, root = join(PROJECT_ROOT, "articles", "publication-attempts")) {
  await mkdir(root, { recursive: true });
  const key = createHash("sha256").update(prepared.articlePath).digest("hex");
  const path = join(root, `${key}.json`);
  const record = { file: relative(PROJECT_ROOT, prepared.articlePath), title: prepared.metadata.title,
    startedAt: new Date().toISOString(), status: "started", doNotRetry: true };
  try { await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error(`Publication attempt already exists; do not retry: ${path}`);
    throw error;
  }
  return { path, record };
}

export async function finishPublicationAttempt(attempt, result) {
  const record = { ...attempt.record, finishedAt: new Date().toISOString(),
    status: result.ok ? "verified" : "needs_review", note: result.data || result.note || null,
    error: result.error || null, doNotRetry: true };
  await atomicJsonWrite(attempt.path, record);
  return record;
}

async function atomicJsonWrite(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export async function recordPublication(prepared, noteData, paths = {}) {
  const statePath = paths.statePath || STATE_PATH;
  const publishedRoot = paths.publishedRoot || PUBLISHED_ROOT;
  if (!noteData.verification?.saved || !noteData.verification.eyecatchUrl ||
      (noteData.mode === "published" && !noteData.verification.published)) {
    throw new Error("Cannot record an unverified publication");
  }
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const now = new Date().toISOString();
  const oldRelative = relative(PROJECT_ROOT, prepared.articlePath).split(sep).join("/");
  let finalPath = prepared.articlePath;
  let finalRelative = oldRelative;

  if (noteData.mode === "published") {
    await mkdir(publishedRoot, { recursive: true });
    finalPath = join(publishedRoot, basename(prepared.articlePath));
    // Keep the draft recoverable if updating state fails; never overwrite an archive.
    await copyFile(prepared.articlePath, finalPath, constants.COPYFILE_EXCL);
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
    verification: noteData.verification,
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
  await atomicJsonWrite(statePath, state);
  if (noteData.mode === "published") {
    // The source is removed only once its archive and state are both durable.
    await unlink(prepared.articlePath);
  }
  return { record, archivedTo: noteData.mode === "published" ? finalPath : null };
}
