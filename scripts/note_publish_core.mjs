import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRAFTS_ROOT = join(PROJECT_ROOT, "articles", "drafts");
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
  isPublish = false,
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
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const bodyImageMatches = [...body.matchAll(imagePattern)];
  if (bodyImageMatches.length < 2 || bodyImageMatches.length > 3) {
    throw new Error(`Article must contain 2 to 3 body images, got ${bodyImageMatches.length}`);
  }
  if (bodyImageMatches.some((match) => !match[1].trim())) {
    throw new Error("Body images must have non-empty alt text");
  }
  if (new Set(bodyImageMatches.map((match) => match[2].trim())).size !== bodyImageMatches.length) {
    throw new Error("Body images must reference 2 to 3 distinct files");
  }
  const seen = new Set();
  for (const match of bodyImageMatches) {
    const reference = match[2].trim();
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
// The key is derived from content + publish intent (not the file path), so rewriting
// the same path as a different article never collides with an unrelated prior attempt,
// and re-saving identical content under a new path is still recognized as the same attempt.
export async function beginPublicationAttempt(prepared, root = join(PROJECT_ROOT, "articles", "publication-attempts")) {
  await mkdir(root, { recursive: true });
  const contentKey = `${prepared.metadata.title}\n${prepared.options?.markdown ?? ""}\n${prepared.options?.isPublish ? "publish" : "draft"}`;
  const key = createHash("sha256").update(contentKey).digest("hex");
  const path = join(root, `${key}.json`);
  const record = { file: relative(PROJECT_ROOT, prepared.articlePath), title: prepared.metadata.title,
    startedAt: new Date().toISOString(), status: "started", doNotRetry: true };
  try {
    await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    // Only reopen the slot when a prior attempt is confirmed terminal (finishPublicationAttempt
    // ran) and confirmed safe to retry (never reached note's API). An in-flight or ambiguous
    // record keeps blocking, since we cannot tell whether it silently reached note.
    let previous = null;
    try { previous = JSON.parse(await readFile(path, "utf8")); } catch { /* corrupt/unreadable: stay blocked */ }
    if (!previous || previous.status === "started" || previous.doNotRetry !== false) {
      throw new Error(`Publication attempt already exists; do not retry: ${path}`);
    }
    await atomicJsonWrite(path, record);
  }
  return { path, record };
}

export async function finishPublicationAttempt(attempt, result) {
  // result.doNotRetry === false is an explicit, positive signal (set by the browser-side
  // publish() in note_web_publish.js via progress.started) that nothing reached note's API
  // yet. Any other value (true, or absent as with TransportInterrupted/NOTE_JOURNAL_ERROR)
  // stays non-retryable, since we cannot rule out a write that succeeded remotely.
  const doNotRetry = result.doNotRetry !== false;
  const record = { ...attempt.record, finishedAt: new Date().toISOString(),
    status: result.ok ? "verified" : "needs_review", note: result.data || result.note || null,
    error: result.error || null, doNotRetry };
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
  if (!noteData.verification?.saved || !noteData.verification.eyecatchUrl ||
      (noteData.mode === "published" && !noteData.verification.published)) {
    throw new Error("Cannot record an unverified publication");
  }
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const now = new Date().toISOString();
  const oldRelative = relative(PROJECT_ROOT, prepared.articlePath).split(sep).join("/");
  const previous = (state.drafts || []).find((item) => item.file === oldRelative || item.title === prepared.metadata.title) || {};
  state.drafts = (state.drafts || []).filter((item) => item.file !== oldRelative && item.title !== prepared.metadata.title);

  const record = {
    ...previous,
    file: null,
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
  return { record, archivedTo: null };
}
