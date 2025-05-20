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

import { error } from 'console';
import * as crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 64 hex characters = 32 bytes
const IV_LENGTH = 16;

const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex'); // Make sure this is 32 bytes

export function encryptTenantId(tenantId: string): string {
    console.log("you need me", require('crypto').randomBytes(32).toString('hex'));
    console.log("i started with you: ", ENCRYPTION_KEY)
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
    let encrypted = cipher.update(tenantId);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptTenantId(text: string): string {
    const [iv, encrypted] = text.split(':');
    console.error('❌ Decryption error for sure:', iv, encrypted, ENCRYPTION_KEY);
    try {
        const [iv, encrypted] = text.split(':');
        const ivBuffer = Buffer.from(iv, 'hex');
        const encryptedText = Buffer.from(encrypted, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        console.log("✅ Decrypted string:", decrypted.toString());
        return decrypted.toString();
    } catch (err) {
        console.error('❌ Decryption error:', err.message);
        return null;
    }
}

