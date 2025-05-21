// import * as crypto from 'crypto';

// const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '9b4f3a63e1d97fdc74694b3e5d145a56';
// const IV_LENGTH = 16;

// export function encryptTenantId(tenantId: string): string {
//     const iv = crypto.randomBytes(IV_LENGTH);
//     const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
//     let encrypted = cipher.update(tenantId);
//     encrypted = Buffer.concat([encrypted, cipher.final()]);
//     return iv.toString('hex') + ':' + encrypted.toString('hex');
// }

// export function decryptTenantId(text: string): string {
//     const [iv, encrypted] = text.split(':');
//     const ivBuffer = Buffer.from(iv, 'hex');
//     const encryptedText = Buffer.from(encrypted, 'hex');
//     const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), ivBuffer);
//     let decrypted = decipher.update(encryptedText);
//     decrypted = Buffer.concat([decrypted, decipher.final()]);
//     console.log("i am decrypted string", decrypted.toString())
//     return decrypted.toString();
// }

// import { error } from 'console';


//FIXME: This code is not working as expected. I need to debug it.
// import * as crypto from 'crypto';

// const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 64 hex characters = 32 bytes
// const IV_LENGTH = 16;

// const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex'); // Make sure this is 32 bytes

// export function encryptTenantId(tenantId: string): string {
//     console.log("you need me", require('crypto').randomBytes(32).toString('hex'));
//     console.log("i started with you: ", ENCRYPTION_KEY)
//     const iv = crypto.randomBytes(IV_LENGTH);
//     const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
//     let encrypted = cipher.update(tenantId);
//     encrypted = Buffer.concat([encrypted, cipher.final()]);
//     return iv.toString('hex') + ':' + encrypted.toString('hex');
// }

// export function decryptTenantId(text: string): string {
//     const [iv, encrypted] = text.split(':');
//     console.error('❌ Decryption error for sure:', iv, encrypted, ENCRYPTION_KEY);
//     try {
//         const [iv, encrypted] = text.split(':');
//         const ivBuffer = Buffer.from(iv, 'hex');
//         const encryptedText = Buffer.from(encrypted, 'hex');
//         const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
//         let decrypted = decipher.update(encryptedText);
//         decrypted = Buffer.concat([decrypted, decipher.final()]);
//         console.log("✅ Decrypted string:", decrypted.toString());
//         return decrypted.toString();
//     } catch (err) {
//         console.error('❌ Decryption error:', err.message);
//         return null;
//     }
// }

import * as crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  throw new Error(
    'Invalid ENCRYPTION_KEY. Must be a 64-character hexadecimal string (32 bytes).'
  );
}

const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex'); // Now safe
const IV_LENGTH = 16; // For AES-CBC

export function encryptTenantId(tenantId: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  let encrypted = cipher.update(tenantId, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptTenantId(text: string): string | null {
  try {
    const [ivHex, encryptedHex] = text.split(':');
    if (!ivHex || !encryptedHex) throw new Error('Invalid encrypted data format');

    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('❌ Decryption failed:', err.message);
    return null;
  }
}