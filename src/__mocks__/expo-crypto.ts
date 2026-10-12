import { randomBytes } from 'crypto';

export const getRandomBytes = (byteCount: number): Uint8Array => new Uint8Array(randomBytes(byteCount));
