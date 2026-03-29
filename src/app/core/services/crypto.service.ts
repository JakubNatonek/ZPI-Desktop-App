import { Injectable } from '@angular/core';
import { ChatApiService } from '../../features/chat/services/chat-api.service';

// Minimal IndexedDB helpers for simple key/value storage
async function idbGet(key: string): Promise<any | null> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('zpi-crypto', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', 'readonly');
      const store = tx.objectStore('kv');
      const getReq = store.get(key);
      getReq.onsuccess = () => resolve(getReq.result ?? null);
      getReq.onerror = () => resolve(null);
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('zpi-crypto', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}
function bufToBase64(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64: string) {
  const str = atob(b64);
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
  return arr.buffer;
}

function pemToArrayBuffer(pem: string) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return base64ToBuf(b64);
}

function exportPublicKeyToPem(key: CryptoKey) {
  return window.crypto.subtle.exportKey('spki', key).then((spki) => {
    const b64 = bufToBase64(spki);
    const pem = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;
    return pem;
  });
}

@Injectable({ providedIn: 'root' })
export class CryptoService {
  constructor(private chatApi: ChatApiService) {}

  async ensureRSAKeyPair(): Promise<CryptoKeyPair> {
    const stored = await idbGet('rsa_private_jwk');
    if (stored) {
      try {
        const jwk = stored as JsonWebKey;
        const privateKey = await window.crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt']);
        const publicJwk = JSON.parse(localStorage.getItem('rsa_public_jwk') || 'null');
        let publicKey: CryptoKey | null = null;
        if (publicJwk) {
          publicKey = await window.crypto.subtle.importKey('jwk', publicJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
        }
        return { publicKey: publicKey as CryptoKey, privateKey } as CryptoKeyPair;
      } catch (e) {
        console.warn('Failed to import stored RSA keys from IndexedDB, regenerating', e);
      }
    }

    const keyPair = await window.crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['encrypt', 'decrypt']
    );

    const pubJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
    localStorage.setItem('rsa_public_jwk', JSON.stringify(pubJwk));
    await idbSet('rsa_private_jwk', privJwk);

    // export and post public PEM to backend if needed will be handled by caller
    return keyPair;
  }

  async getPublicPem(): Promise<string> {
    const pubJwkRaw = localStorage.getItem('rsa_public_jwk');
    if (!pubJwkRaw) {
      const kp = await this.ensureRSAKeyPair();
      return exportPublicKeyToPem(kp.publicKey as CryptoKey);
    }
    const pubJwk = JSON.parse(pubJwkRaw);
    const pubKey = await window.crypto.subtle.importKey('jwk', pubJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
    return exportPublicKeyToPem(pubKey);
  }

  async generateAESKey() {
    return window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  async encryptAESGCM(aesKey: CryptoKey, plaintext: string) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder().encode(plaintext);
    const cipher = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc);
    return {
      iv: bufToBase64(iv.buffer),
      ciphertext: bufToBase64(cipher),
    };
  }

  async wrapAESKeyForRecipient(aesKey: CryptoKey | ArrayBuffer, recipientPublicPem: string) {
    console.log('wrapAESKeyForRecipient: starting wrap; recipientPublicPem length=', recipientPublicPem?.length ?? 0);
    if (!recipientPublicPem) {
      throw new Error('No recipient public PEM provided');
    }
    const pubBuf = pemToArrayBuffer(recipientPublicPem);
    console.log('wrapAESKeyForRecipient: importing recipient public key');
    const pubKey = await window.crypto.subtle.importKey('spki', pubBuf, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);

    let raw: ArrayBuffer;
    if (aesKey instanceof ArrayBuffer) {
      raw = aesKey as ArrayBuffer;
      console.log('wrapAESKeyForRecipient: received raw ArrayBuffer for AES key, length=', raw.byteLength);
    } else {
      raw = await window.crypto.subtle.exportKey('raw', aesKey as CryptoKey);
      console.log('wrapAESKeyForRecipient: exported AES CryptoKey to raw ArrayBuffer, length=', raw.byteLength);
    }

    console.log('wrapAESKeyForRecipient: wrapping AES key with RSA-OAEP');
    const wrapped = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, raw);
    const wrappedB64 = bufToBase64(wrapped);
    console.log('wrapAESKeyForRecipient: wrapped key length (base64)=', wrappedB64.length);
    return wrappedB64;
  }

  async unwrapAESKey(wrappedB64: string) {
    const wrapped = base64ToBuf(wrappedB64);
    const privJwk = await idbGet('rsa_private_jwk');
    if (!privJwk) throw new Error('Missing private key');
    const privKey = await window.crypto.subtle.importKey('jwk', privJwk as JsonWebKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
    const raw = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privKey, wrapped);
    const aesKey = await window.crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
    return aesKey;
  }

  /**
   * Read encrypted RSA private JWK from IndexedDB, decrypt it with provided AES key,
   * import and return a `CryptoKey` suitable for RSA-OAEP decryption.
   *
   * Expected storage format (IndexedDB key `rsa_private_encrypted`):
   * { iv: string (base64), data: string (base64) }
   */
  async getPrivateKeyFromEncryptedStorage(aesKey: CryptoKey): Promise<CryptoKey> {
    const record = await idbGet('rsa_private_encrypted');
    if (!record) throw new Error('Missing encrypted private key in IndexedDB (rsa_private_encrypted)');

    const ivB64 = (record as any).iv;
    const dataB64 = (record as any).data || (record as any).ciphertext;
    if (!ivB64 || !dataB64) throw new Error('Invalid encrypted private key record format in IndexedDB');

    const iv = base64ToBuf(ivB64);
    const cipher = base64ToBuf(dataB64);

    const raw = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, aesKey, cipher);
    const jwkJson = new TextDecoder().decode(raw);
    const jwk = JSON.parse(jwkJson);

    const privKey = await window.crypto.subtle.importKey(
      'jwk',
      jwk as JsonWebKey,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt']
    );
    return privKey;
  }

  async decryptAESGCM(aesKey: CryptoKey, ivB64: string, ciphertextB64: string) {
    const iv = base64ToBuf(ivB64);
    const ciphertext = base64ToBuf(ciphertextB64);
    const plainBuf = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, aesKey, ciphertext);
    return new TextDecoder().decode(plainBuf);
  }

  // Compatibility wrappers for earlier/simple API
  async generateAesKey(): Promise<CryptoKey> {
    return this.generateAESKey();
  }

  async exportKeyToBase64(key: CryptoKey): Promise<string> {
    const raw = await window.crypto.subtle.exportKey('raw', key);
    return bufToBase64(raw);
  }

  async exportRawKey(key: CryptoKey): Promise<ArrayBuffer> {
    console.log('exportRawKey: exporting AES CryptoKey to ArrayBuffer');
    const raw = await window.crypto.subtle.exportKey('raw', key);
    console.log('exportRawKey: done, length=', raw.byteLength);
    return raw;
  }

  async importKeyFromBase64(base64: string): Promise<CryptoKey> {
    const raw = base64ToBuf(base64);
    return await window.crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }

  async encryptText(key: CryptoKey, plaintext: string): Promise<{ iv: string; ciphertext: string }> {
    return this.encryptAESGCM(key, plaintext);
  }

  async decryptText(key: CryptoKey, ivBase64: string, ciphertextBase64: string): Promise<string> {
    return this.decryptAESGCM(key, ivBase64, ciphertextBase64);
  }

  arrayBufferToBase64(buffer: ArrayBuffer): string {
    return bufToBase64(buffer);
  }

  base64ToArrayBuffer(base64: string): ArrayBuffer {
    return base64ToBuf(base64);
  }

  // Debug helpers
  async getWrappedKeyByteLength(wrappedB64: string): Promise<number> {
    try {
      const buf = base64ToBuf(wrappedB64);
      return new Uint8Array(buf).byteLength;
    } catch (e) {
      return -1;
    }
  }

  async hasPrivateJwk(): Promise<boolean> {
    const j = await idbGet('rsa_private_jwk');
    return !!j;
  }

  async hasEncryptedPrivate(): Promise<boolean> {
    const r = await idbGet('rsa_private_encrypted');
    return !!r;
  }

  getStoredPublicJwk(): JsonWebKey | null {
    const raw = localStorage.getItem('rsa_public_jwk');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as JsonWebKey;
    } catch (e) {
      return null;
    }
  }

  /**
   * Test helper: RSA-OAEP decrypt of wrapped AES key (returns raw ArrayBuffer).
   * Emits test logs as required by the verification step.
   *
   * Logs sequence:
   * 1) separator line
   * 2) 'TEST'
   * 3) decryptedAesKeyBuffer.byteLength
   */
  async rsaDecryptWrappedAesKeyForTest(wrappedB64: string, privateKey: CryptoKey): Promise<ArrayBuffer> {
    console.log('===========================================================');
    const wrapped = base64ToBuf(wrappedB64);
    const decryptedAesKeyBuffer = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wrapped);
    console.log('TEST');
    console.log((decryptedAesKeyBuffer as ArrayBuffer).byteLength);
    return decryptedAesKeyBuffer as ArrayBuffer;
  }

  /**
   * Test helper: decrypt AES-GCM ciphertext and log result for verification.
   * Inputs may be ArrayBuffer, Uint8Array or base64 string.
   * Logs separator, 'TEST' and the UTF-8 decoded plaintext (if decodable).
   */
  async aesDecryptForTest(
    encryptedMessage: ArrayBuffer | Uint8Array | string,
    iv: ArrayBuffer | Uint8Array | string,
    aesKey: CryptoKey,
  ): Promise<ArrayBuffer> {
    console.log('===========================================================');

    const toUint8 = (v: ArrayBuffer | Uint8Array | string): Uint8Array => {
      if (typeof v === 'string') return new Uint8Array(base64ToBuf(v));
      if (v instanceof Uint8Array) return v;
      return new Uint8Array(v as ArrayBuffer);
    };

    const encView = toUint8(encryptedMessage);
    const ivView = toUint8(iv);

    const encBuf = encView.buffer.slice(encView.byteOffset, encView.byteOffset + encView.byteLength) as ArrayBuffer;
    const ivBuf = ivView.buffer.slice(ivView.byteOffset, ivView.byteOffset + ivView.byteLength) as ArrayBuffer;

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBuf as ArrayBuffer) },
      aesKey,
      encBuf as ArrayBuffer,
    );

    console.log('TEST');
    try {
      const txt = new TextDecoder().decode(decrypted);
      console.log(txt);
    } catch (e) {
      // If not valid UTF-8, log byteLength instead
      console.log((decrypted as ArrayBuffer).byteLength);
    }

    return decrypted as ArrayBuffer;
  }
}
