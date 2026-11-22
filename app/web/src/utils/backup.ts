import { strToU8, zip } from 'fflate';

export async function createBackupZip(snapshot: Record<string, unknown>): Promise<File> {
  const files: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(snapshot)) {
    files[`${name}.json`] = strToU8(JSON.stringify(value, null, 2));
  }
  const manifest = await Promise.all(Object.entries(files).map(async ([name, bytes]) => ({
    name, bytes: bytes.length,
    sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))).map((v) => v.toString(16).padStart(2, '0')).join(''),
  })));
  files['manifest.json'] = strToU8(JSON.stringify({ formatVersion: 1, files: manifest }, null, 2));
  files['README.txt'] = strToU8('Sanitized logical export. Credentials, sessions, external files and Redis jobs are excluded. Concurrent writes may occur during export. Keep MongoDB backups and separately back up uploaded files. Restore requires an operator-reviewed import; this ZIP is not an automatic disaster-recovery image. Contains personal and business data: store securely.');
  const bytes = await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 6 }, (error, result) => error ? reject(error) : resolve(result)));
  return new File([new Uint8Array(bytes)], `kazmion-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`, { type: 'application/zip' });
}
