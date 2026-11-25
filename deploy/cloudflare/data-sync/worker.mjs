import { createHash, timingSafeEqual } from 'node:crypto';

const LIMIT = 50 * 1024 * 1024;
const CHUNK_SIZE = 1_500_000;

function authorized(request, env) {
  const header = request.headers.get('Authorization') ?? '';
  const expected = `Bearer ${env.DATA_SYNC_TOKEN}`;
  return /^[a-f0-9]{64}$/i.test(env.DATA_SYNC_TOKEN ?? '')
    && header.length === expected.length
    && timingSafeEqual(createHash('sha256').update(header).digest(), createHash('sha256').update(expected).digest())
    && /^[a-f0-9]{24}$/i.test(env.BUSINESS_ID ?? '')
    && request.headers.get('X-Business-Id') === env.BUSINESS_ID;
}

async function downloadSnapshot(env) {
  const db = env.SNAPSHOTS;
  const snapshot = await db.prepare(`SELECT snapshots.id, snapshots.byte_count, snapshots.sha256
    FROM current_snapshots JOIN snapshots ON snapshots.id = current_snapshots.snapshot_id
    WHERE current_snapshots.business_id = ?`).bind(env.BUSINESS_ID).first();
  if (!snapshot) return new Response(null, { status: 404 });
  let ordinal = 0;
  let remaining = snapshot.byte_count;
  const body = new ReadableStream({
    async pull(controller) {
      const chunk = await db.prepare('SELECT content FROM snapshot_chunks WHERE snapshot_id = ? AND ordinal = ?')
        .bind(snapshot.id, ordinal++).first();
      if (!chunk) throw new Error('Snapshot chunk missing');
      const bytes = new Uint8Array(chunk.content);
      if (bytes.length !== Math.min(CHUNK_SIZE, remaining)) throw new Error('Invalid snapshot chunk length');
      remaining -= bytes.length;
      controller.enqueue(bytes);
      if (remaining === 0) controller.close();
    },
  });
  return new Response(body, { headers: {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/zip',
    'Content-Length': String(snapshot.byte_count),
    'Content-Disposition': `attachment; filename="business-snapshot-${snapshot.id}.zip"`,
    'X-Snapshot-SHA256': snapshot.sha256,
  } });
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/v1/business-snapshot') return new Response(null, { status: 404 });
    if (!authorized(request, env)) return new Response(null, { status: 403 });
    if (request.method === 'GET') return downloadSnapshot(env);
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    if (!request.body || request.headers.get('Content-Type') !== 'application/zip') return new Response(null, { status: 415 });
    if (Number(request.headers.get('Content-Length')) > LIMIT) return new Response(null, { status: 413 });

    const db = env.SNAPSHOTS;
    const id = crypto.randomUUID();
    const started = Date.now();
    const hash = createHash('sha256');
    const buffer = new Uint8Array(CHUNK_SIZE);
    let index = 0;
    let buffered = 0;
    let total = 0;
    let published = false;

    const storeChunk = async () => {
      await db.prepare('INSERT INTO snapshot_chunks VALUES (?, ?, ?)')
        .bind(id, index++, buffer.buffer.slice(0, buffered)).run();
      buffered = 0;
    };

    try {
      await db.prepare('INSERT INTO snapshots (id, business_id, started_at) VALUES (?, ?, ?)')
        .bind(id, env.BUSINESS_ID, started).run();
      for await (const input of request.body) {
        total += input.length;
        if (total > LIMIT) return new Response(null, { status: 413 });
        hash.update(input);
        for (let offset = 0; offset < input.length;) {
          const size = Math.min(CHUNK_SIZE - buffered, input.length - offset);
          buffer.set(input.subarray(offset, offset + size), buffered);
          buffered += size;
          offset += size;
          if (buffered === CHUNK_SIZE) await storeChunk();
        }
      }
      if (total < 22) return new Response(null, { status: 400 });
      if (buffered > 0) await storeChunk();
      const [, pointer] = await db.batch([
        db.prepare('UPDATE snapshots SET byte_count = ?, sha256 = ? WHERE id = ?').bind(total, hash.digest('hex'), id),
        db.prepare(`INSERT INTO current_snapshots VALUES (?, ?, ?)
          ON CONFLICT (business_id) DO UPDATE SET snapshot_id = excluded.snapshot_id, started_at = excluded.started_at
          WHERE excluded.started_at >= current_snapshots.started_at`).bind(env.BUSINESS_ID, id, started),
      ]);
      published = pointer.meta.changes > 0;
      return published ? Response.json({ id }, { status: 201 }) : new Response(null, { status: 409 });
    } finally {
      if (!published) {
        await db.prepare('DELETE FROM snapshots WHERE id = ? AND id NOT IN (SELECT snapshot_id FROM current_snapshots)')
          .bind(id).run().catch(() => undefined);
      }
    }
  },

  async scheduled(_event, env) {
    await env.SNAPSHOTS.prepare(`DELETE FROM snapshots WHERE started_at < ?
      AND id NOT IN (SELECT snapshot_id FROM current_snapshots)`).bind(Date.now() - 86_400_000).run();
  },
};
