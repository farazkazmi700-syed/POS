// Run on the Docker host. Source records travel through a pipe, never through a shell or log.
'use strict';
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const [source, target] = process.argv.slice(2);
if (!source || !target || source === target || ![source, target].every(n => /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(n))) {
  throw new Error('Usage: node copy-single-container.cjs <source-container> <postgres-container>');
}

async function exportSource() {
  const { MongoClient } = require('/app/worker/node_modules/mongodb');
  const { once } = require('node:events');
  const client = new MongoClient(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pos');
  async function send(value) {
    if (!process.stdout.write(JSON.stringify(value) + '\n')) await once(process.stdout, 'drain');
  }
  try {
    const db = client.db();
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    for (const { name } of collections) {
      const collection = db.collection(name);
      await send({ name, indexes: await collection.indexes() });
      let count = 0;
      for await (const record of collection.find({}, { raw: true })) {
        await send({ bson: record.toString('base64') });
        count++;
      }
      if (count !== await collection.countDocuments()) throw new Error('Source count changed');
      await send({ count });
    }
    await send({ complete: true });
  } finally { await client.close(); }
}

async function importTarget() {
  const { MongoClient, BSON } = require('/app/worker/node_modules/mongodb');
  const { readFileSync } = require('node:fs');
  const { createInterface } = require('node:readline');
  const { isDeepStrictEqual } = require('node:util');
  const client = new MongoClient(readFileSync('/run/pos/app-uri', 'utf8'));
  let collection, complete = false, verified = 0;
  let operation = 'connect';
  try {
    const db = client.db();
    for await (const line of createInterface({ input: process.stdin })) {
      const frame = JSON.parse(line);
      if (frame.name) {
        operation = 'prepare collection ' + frame.name;
        collection = db.collection(frame.name);
        if (!(await db.listCollections({ name: frame.name }).hasNext())) await db.createCollection(frame.name);
        const existingIndexes = await collection.indexes();
        for (const { key, v, ns, background, ...options } of frame.indexes) {
          operation = 'prepare index ' + frame.name + '.' + options.name;
          const existing = existingIndexes.find(index => index.name === options.name);
          if (!existing) {
            await collection.createIndex(key, options);
          } else {
            const { v: version, ns: namespace, background: buildsInBackground, key: storedKey, ...stored } = existing;
            if (!isDeepStrictEqual(Object.entries(storedKey), Object.entries(key)) || !isDeepStrictEqual(stored, options)) {
              throw new Error('Index definition differs');
            }
          }
        }
      } else if (frame.bson) {
        operation = 'verify record in ' + collection.collectionName;
        const record = BSON.deserialize(Buffer.from(frame.bson, 'base64'), { promoteValues: false });
        const query = { _id: record._id };
        if (!await collection.findOne(query, { projection: { _id: 1 } })) await collection.insertOne(record);
        const copy = await collection.findOne(query, { promoteValues: false });
        const canonical = doc => BSON.EJSON.serialize(doc, { relaxed: false });
        if (!isDeepStrictEqual(canonical(copy), canonical(record))) throw new Error('Stored record differs');
        verified++;
      } else if (frame.count !== undefined) {
        operation = 'verify count in ' + collection.collectionName;
        if (Number(await collection.countDocuments()) !== frame.count) throw new Error('Target count differs');
      } else if (frame.complete) complete = true;
    }
    if (!complete) throw new Error('Incomplete capture');
    console.log('Verified ' + verified + ' source records in PostgreSQL.');
  } catch (error) {
    console.error(operation, error.codeName || error.name);
    throw error;
  } finally { await client.close(); }
}

function execute(name, fn, input) {
  const args = ['exec', ...(input ? ['-i'] : []), name, 'node', '-e',
    '(' + fn.toString() + ')().catch(e => { console.error(e.name, e.code || "migration failed"); process.exitCode = 1; })'];
  const child = spawn('docker', args, { stdio: [input ? 'pipe' : 'ignore', input ? 'inherit' : 'pipe', 'inherit'] });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(name + ' exited with ' + code)));
  });
  return { child, done };
}

async function main() {
  const reader = execute(source, exportSource, false);
  const writer = execute(target, importTarget, true);
  try {
    await Promise.all([reader.done, writer.done, pipeline(reader.child.stdout, writer.child.stdin)]);
  } finally {
    reader.child.kill();
    writer.child.kill();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
