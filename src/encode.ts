/**
 * Percent-encoding for PURL components.
 *
 * Per the spec, the "allowed set" (NOT encoded) is:
 *   - Alphanumeric: A-Z a-z 0-9
 *   - Punctuation:  . - _ ~
 *   - Colon:        : (never encoded, even when not a separator)
 *
 * Everything else is percent-encoded as %XX (uppercase hex).
 */

// Unreserved byte check for the fast-path scan (operates on char codes).
const UNRESERVED = new Uint8Array(128);
for (let c = 0x41; c <= 0x5a; c++) UNRESERVED[c] = 1; // A-Z
for (let c = 0x61; c <= 0x7a; c++) UNRESERVED[c] = 1; // a-z
for (let c = 0x30; c <= 0x39; c++) UNRESERVED[c] = 1; // 0-9
UNRESERVED[0x2e] = 1; // .
UNRESERVED[0x2d] = 1; // -
UNRESERVED[0x5f] = 1; // _
UNRESERVED[0x7e] = 1; // ~
UNRESERVED[0x3a] = 1; // :

// Single lookup: byte → output string (char or %XX). Eliminates per-byte branching.
const BYTE_TO_ENCODED: string[] = new Array(256);
for (let i = 0; i < 256; i++) {
  BYTE_TO_ENCODED[i] =
    i < 128 && UNRESERVED[i]
      ? String.fromCharCode(i)
      : '%' + i.toString(16).toUpperCase().padStart(2, '0');
}

const encoder = new TextEncoder();

/**
 * Percent-encode a PURL component value.
 * Encodes all characters except: A-Za-z0-9 . - _ ~ :
 */
export function percentEncode(s: string): string {
  // Fast path: if every char is unreserved ASCII, return the input unchanged.
  let needsEncoding = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 128 || !UNRESERVED[c]) {
      needsEncoding = true;
      break;
    }
  }
  if (!needsEncoding) return s;

  const bytes = encoder.encode(s);
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += BYTE_TO_ENCODED[bytes[i]];
  }
  return result;
}

/**
 * Percent-decode a string. Handles %XX sequences.
 * Rejects null bytes (%00) which are a common injection vector.
 */
export function percentDecode(s: string): string {
  // Fast path: no percent sequences means nothing to decode and no null byte risk.
  if (!s.includes('%')) return s;
  try {
    const decoded = decodeURIComponent(s);
    if (decoded.includes('\0')) {
      throw new Error('null bytes are not allowed in PURL components');
    }
    return decoded;
  } catch (e) {
    if (e instanceof Error && e.message.includes('null byte')) throw e;
    throw new Error(
      `malformed percent-encoding in "${s.length > 200 ? s.substring(0, 200) + '...' : s}"`
    );
  }
}
