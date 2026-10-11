import * as bcrypt from 'bcryptjs';

export async function isDeveloperRegistrationAllowed(
  email: string,
  password: string,
  configuredEmail: string | undefined,
  configuredPasswordHash: string | undefined,
): Promise<boolean> {
  if (!email || !password || !configuredEmail || !configuredPasswordHash) return false;
  if (email.trim().toLowerCase() !== configuredEmail.trim().toLowerCase()) return false;

  try {
    return await bcrypt.compare(password, configuredPasswordHash);
  } catch {
    return false;
  }
}