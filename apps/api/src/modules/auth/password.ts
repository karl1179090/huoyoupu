import {randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
const options = {N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024};
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, options, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt);
  return `scrypt$131072$8$1$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== '131072' || parts[2] !== '8' || parts[3] !== '1') return false;
  const salt = parts[4]!;
  const stored = Buffer.from(parts[5]!, 'hex');
  if (!/^[a-f0-9]{32}$/.test(salt) || stored.length !== 64) return false;
  return timingSafeEqual(stored, await derive(password, salt));
}
