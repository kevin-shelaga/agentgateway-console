const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
// Largest multiple of 62 below 256 — bytes above this are rejected so every
// character is uniformly distributed (no modulo bias).
const REJECTION_BOUND = 248;

/**
 * Cryptographically random API key in the conventional secret-key format,
 * e.g. "sk_kF8…" (40 chars ≈ 238 bits).
 * For gateway-issued credentials; provider keys (OpenAI, …) are pasted.
 */
export function generateApiKey(prefix = "sk", length = 40): string {
  let out = "";
  const buffer = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) {
      if (byte < REJECTION_BOUND && out.length < length) {
        out += ALPHABET[byte % ALPHABET.length];
      }
    }
  }
  return `${prefix}_${out}`;
}
