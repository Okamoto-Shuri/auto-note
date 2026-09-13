import { createHash } from 'node:crypto';

// Validate evidence completeness and freshness, not aesthetic quality or provenance.
export function checkVisualReview(brief, images) {
  const blocks = [...brief.matchAll(/```visual-review\s*\n([\s\S]*?)\n```/g)];
  if (blocks.length !== 1) throw new Error('Visual review requires one visual-review record');
  let record;
  try { record = JSON.parse(blocks[0][1]); } catch { throw new Error('Visual review JSON is invalid'); }
  if (record?.version !== 1 || !Array.isArray(record.images) || record.images.length !== images.length) {
    throw new Error('Visual review must cover every image');
  }
  const seen = new Set();
  for (const { bytes, role } of images) {
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (seen.has(hash)) throw new Error('Duplicate image content in publication');
    seen.add(hash);
    const entries = record.images.filter((entry) => entry?.sha256 === hash && entry.role === role);
    const entry = entries[0];
    const text = (value) => typeof value === 'string' && value.trim().length > 0;
    if (entries.length !== 1 || entry.generator !== 'image_gen' || !text(entry.prompt) || !text(entry.purpose) ||
        entry.review?.fullSize !== true || entry.review?.mobile !== true || entry.review?.articleMatch !== true || !text(entry.review?.notes)) {
      throw new Error('Visual review missing, incomplete or stale for an image');
    }
  }
}
