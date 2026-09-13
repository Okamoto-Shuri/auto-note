import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkVisualReview } from '../scripts/check_visual_review.mjs';

test('visual evidence covers exact final files and all viewing checks', () => {
  const images = ['cover', 'diagram1', 'diagram2'].map((value, i) => ({ bytes: Buffer.from(value), role: i ? 'body' : 'eyecatch' }));
  const record = { version: 1, images: images.map(({ bytes, role }) => ({
    sha256: createHash('sha256').update(bytes).digest('hex'), role, generator: 'image_gen',
    prompt: 'token and metadata relation', purpose: 'explain separate storage',
    review: { fullSize: true, mobile: true, articleMatch: true, notes: 'reference arrow matches paragraph' },
  })) };
  const brief = (r = record) => '```visual-review\n' + JSON.stringify(r) + '\n```';
  assert.doesNotThrow(() => checkVisualReview(brief(), images));
  assert.throws(() => checkVisualReview('', images), /Visual review/);
  assert.throws(() => checkVisualReview(brief(), [...images.slice(0, 2), { ...images[2], bytes: Buffer.from('changed') }]), /stale/);
  assert.throws(() => checkVisualReview(brief(), [images[0], images[1], images[1]]), /Duplicate/);
  for (const field of ['fullSize', 'mobile', 'articleMatch']) {
    const changed = structuredClone(record);
    changed.images[1].review[field] = false;
    assert.throws(() => checkVisualReview(brief(changed), images), /incomplete/);
  }
  const svg = structuredClone(record);
  svg.images[0].generator = 'svg-render';
  assert.throws(() => checkVisualReview(brief(svg), images), /incomplete/);
  assert.throws(() => checkVisualReview(brief({ ...record, images: record.images.slice(1) }), images), /every image/);
});
