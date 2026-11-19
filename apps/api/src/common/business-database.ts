import { ServiceUnavailableException } from '@nestjs/common';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

export async function waitForBusinessDatabase(tenantId: string) {
  const directory = process.env.BUSINESS_DB_DIRECTORY;
  if (!directory) return;
  if (!/^[a-f0-9]{24}$/.test(tenantId)) throw new Error('Invalid business identity');
  const deadline = Date.now() + 30000;
  do {
    try {
      await access(join(directory, tenantId));
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await setTimeout(200);
    }
  } while (Date.now() < deadline);
  throw new ServiceUnavailableException('Business database provisioning timed out');
}
