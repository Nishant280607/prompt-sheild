/**
 * Masking helpers. Secrets must never leave the server unmasked:
 * findings, reports, PDFs and prompt previews all use these functions.
 */

/** Keep a short prefix and replace the rest with asterisks (same length). */
export function maskKeepPrefix(value: string, visible = 4): string {
  if (value.length <= visible + 2) return '*'.repeat(value.length);
  return value.slice(0, visible) + '*'.repeat(value.length - visible);
}

/** Replace every non-separator character with an asterisk. */
export function maskAll(value: string): string {
  return value.replace(/[^\s\-:./@]/g, '*');
}

/** Keep the last `visible` digits of a number (cards, IDs, phone numbers) and preserve separators. */
export function maskDigitsKeepLast(value: string, visible = 4): string {
  const totalDigits = (value.match(/\d/g) ?? []).length;
  let seen = 0;
  return value.replace(/\d/g, (digit) => {
    seen += 1;
    return seen > totalDigits - visible ? digit : '*';
  });
}

/** j*******@company.com - keeps the domain, which is useful context but rarely sensitive on its own. */
export function maskEmail(value: string): string {
  const at = value.indexOf('@');
  if (at <= 0) return maskAll(value);
  const local = value.slice(0, at);
  const maskedLocal = local.length === 1 ? '*' : `${local[0]}${'*'.repeat(local.length - 1)}`;
  return `${maskedLocal}${value.slice(at)}`;
}

/** Shorten very long runs of asterisks for display (evidence stays readable). */
export function compactMask(value: string, maxRun = 16): string {
  return value.replace(new RegExp(`\\*{${maxRun + 1},}`, 'g'), '*'.repeat(maxRun));
}
