<?php
// เข้ารหัส/ถอดรหัส PII (ชื่อ/อีเมล/เบอร์โทร) ก่อนบันทึกลงฐานข้อมูล WordPress
// (PDPA: encryption at rest) — direct PHP port of strapi-cms/src/utils/
// pii-crypto.ts, same algorithm and same iv.ciphertext.authTag base64-dot-
// joined wire format on purpose (not because the two stores ever need to
// interoperate today, just so the format is already proven and documented
// once). Uses its OWN key (WEBX_WP_PII_KEY), deliberately separate from
// Strapi's PII_ENCRYPTION_KEY and webx-studio's WEBX_ENCRYPTION_KEY — same
// "different security domain, don't share keys across domains" rationale
// pii-crypto.ts's own header comment already states.
//
// Used by public-forms-api.php (encrypt on submit) and webx-studio's
// wordpress.ts adapter (decrypt on read, via the wp:complaint/wp:application
// ACF field list) — WordPress has no lifecycle-hook system the way Strapi's
// content-types do, so both directions are called explicitly at their call
// sites rather than firing automatically on every read/write.

define('WEBX_PII_ALGO', 'aes-256-gcm');
define('WEBX_PII_IV_LEN', 12); // 96-bit, GCM standard

function webx_pii_key(): string {
    $raw = getenv('WEBX_WP_PII_KEY');
    if (!$raw) throw new Exception('WEBX_WP_PII_KEY not configured');
    $key = base64_decode($raw, true);
    if ($key === false || strlen($key) !== 32) throw new Exception('WEBX_WP_PII_KEY must decode (base64) to exactly 32 bytes');
    return $key;
}

/** iv.ciphertext.authTag, each part base64, dot-joined — a single string
 * that stores directly in a plain ACF text/textarea field. Fresh random IV
 * every call. */
function webx_pii_encrypt(string $plaintext): string {
    $key = webx_pii_key();
    $iv = openssl_random_pseudo_bytes(WEBX_PII_IV_LEN);
    $tag = '';
    $ciphertext = openssl_encrypt($plaintext, WEBX_PII_ALGO, $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($ciphertext === false) throw new Exception('PII encryption failed');
    return base64_encode($iv) . '.' . base64_encode($ciphertext) . '.' . base64_encode($tag);
}

/** Throws on a malformed payload or a failed auth tag (tampered data or the
 * wrong/rotated key) — never silently swallow and return an empty string. */
function webx_pii_decrypt(string $payload): string {
    $parts = explode('.', $payload);
    if (count($parts) !== 3 || !$parts[0] || !$parts[1] || !$parts[2]) {
        throw new Exception('Malformed encrypted PII payload');
    }
    [$ivB64, $ctB64, $tagB64] = $parts;
    $key = webx_pii_key();
    $plaintext = openssl_decrypt(
        base64_decode($ctB64), WEBX_PII_ALGO, $key, OPENSSL_RAW_DATA,
        base64_decode($ivB64), base64_decode($tagB64)
    );
    if ($plaintext === false) throw new Exception('PII decryption failed (bad key or tampered data)');
    return $plaintext;
}

/** True if a value looks like a webx_pii_encrypt() payload (3 base64 parts,
 * dot-joined) — guards against re-encrypting an already-encrypted value and
 * against decrypting a plaintext value (e.g. a row written before this
 * feature existed). */
function webx_pii_looks_encrypted($value): bool {
    if (!is_string($value)) return false;
    $parts = explode('.', $value);
    if (count($parts) !== 3) return false;
    foreach ($parts as $p) {
        if ($p === '' || !preg_match('/^[A-Za-z0-9+\/]+=*$/', $p)) return false;
    }
    return true;
}

/** Encrypts $value in place if it's a non-empty string not already
 * encrypted — the one-value equivalent of pii-crypto.ts's encryptFields(),
 * called per-field at each submit handler's own call site instead of a
 * shared lifecycle hook (WordPress has none). */
function webx_pii_encrypt_if_needed(?string $value): string {
    if (!$value) return '';
    return webx_pii_looks_encrypted($value) ? $value : webx_pii_encrypt($value);
}

/** Decrypts $value if it looks encrypted, otherwise returns it unchanged
 * (a legacy plaintext row, or a genuinely empty field) — never throws on a
 * value that was never encrypted in the first place. */
function webx_pii_decrypt_if_needed(?string $value): string {
    if (!$value) return '';
    return webx_pii_looks_encrypted($value) ? webx_pii_decrypt($value) : $value;
}
