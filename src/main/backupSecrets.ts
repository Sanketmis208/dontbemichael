/**
 * Saved passwords and keys in a backup (docs/designs/backup-restore.md):
 * the app keeps them encrypted with this computer's own key (Keychain), which
 * no other computer can read. A backup carries them sealed with a password the
 * owner chooses instead: scrypt for the key, AES-256-GCM to seal, so a wrong
 * password or a changed file is refused, never read as garbage. Restore opens
 * them and locks them to the new computer again.
 *
 * Plain node crypto, no electron import, so it tests as a node module.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

export interface SealedSecrets {
  v: 1;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

/** The shortest backup password accepted. */
export const MIN_BACKUP_PASSWORD = 8;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function keyFor(password: string, salt: Buffer): Buffer {
  return scryptSync(password.normalize('NFC'), salt, 32, SCRYPT);
}

/** Seal { ref: plaintext } with the backup password. */
export function sealSecrets(secrets: Record<string, string>, password: string): SealedSecrets {
  if (password.length < MIN_BACKUP_PASSWORD) throw new Error('password too short');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(password, salt), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(secrets), 'utf8'), cipher.final()]);
  return { v: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

/** Open them with the backup password; throws 'wrong password' when it is not
 *  the one they were sealed with (or the file was changed). */
export function openSecrets(sealed: SealedSecrets, password: string): Record<string, string> {
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFor(password, Buffer.from(sealed.salt, 'base64')), Buffer.from(sealed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8');
    const v = JSON.parse(plain) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('bad');
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === 'string')) as Record<string, string>;
  } catch {
    throw new Error('wrong password');
  }
}
