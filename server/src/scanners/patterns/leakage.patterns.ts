import type { RecommendationCode, Severity } from '../../types/analysis.js';
import { maskDigitsKeepLast, maskEmail, maskKeepPrefix } from '../../utils/mask.js';
import { shannonEntropy } from '../../utils/text.js';

/** How a detected value is masked. All styles keep the original length so offsets stay valid. */
export type MaskStyle = 'prefix' | 'full' | 'digits' | 'phone' | 'email' | 'privateKey' | 'ip' | 'none';

export interface SensitiveDetector {
  id: string;
  label: string;
  severity: Severity;
  /** Must use the g and d (match indices) flags. */
  pattern: RegExp;
  /** Capture group holding the sensitive value (0 = whole match). */
  valueGroup?: number;
  mask: MaskStyle;
  validate?: (value: string, fullMatch: string, text: string, start: number) => boolean;
  maxMatches?: number;
  explanation: string;
  recommendation: RecommendationCode;
}

export interface SensitiveSpan {
  detectorId: string;
  label: string;
  severity: Severity;
  /** Offsets of the sensitive value (the part that is masked). */
  start: number;
  end: number;
  /** Offsets of the full match (used for evidence). */
  matchStart: number;
  matchEnd: number;
  mask: MaskStyle;
}

/** Values that are clearly placeholders rather than real secrets. */
const PLACEHOLDER_VALUE =
  /^(?:\*+|x{3,}|•+|\.{3,}|-+|_+|<[^>]*>|\{\{?[^}]*\}\}?|\$\{[^}]*\}|\[[^\]]*\]|%\w+%|your[-_ ]?\w*|my[-_ ]?\w*|(?:change|replace)[-_ ]?(?:me|this)|example\w*|placeholder|redacted|dummy|sample\w*|test(?:ing)?|null|none|undefined|n\/a|tbd|todo|secret|password|token|value|string|abc123|123456|\w*_here|(?:process\.)?env\.\w+)$/i;

export const isPlaceholderValue = (value: string) => PLACEHOLDER_VALUE.test(value.replace(/^["']|["']$/g, ''));

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

const hasDigit = (value: string) => /\d/.test(value);
const hasMixedCase = (value: string) => /[a-z]/.test(value) && /[A-Z]/.test(value);
const hasSymbol = (value: string) => /[^A-Za-z0-9]/.test(value);
const EXAMPLE_DOMAIN = /@(?:[\w-]+\.)*(?:example\.(?:com|org|net)|example|test|invalid|localhost)$/i;
const PHONE_CONTEXT = /\b(?:phone|tel|telephone|mobile|cell|call|contact|whatsapp|fax|sms|number)\b[^\n]{0,20}$/i;

/**
 * Ordered from most specific to most generic: when two detectors overlap,
 * the earlier (more specific) detector wins.
 */
export const SENSITIVE_DETECTORS: readonly SensitiveDetector[] = [
  {
    id: 'LEAK-001',
    label: 'Private key block',
    severity: 'CRITICAL',
    pattern:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----[\s\S]{0,6000}?(?:-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----|$)/dg,
    mask: 'privateKey',
    explanation: 'A private key is embedded in the prompt. Anyone who can read or extract the prompt can impersonate the key owner.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-002',
    label: 'Anthropic-style API key',
    severity: 'CRITICAL',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/dg,
    mask: 'prefix',
    explanation: 'A string matching the format of an Anthropic API key was found. Prompts can be extracted, so keys in prompts should be treated as exposed.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-003',
    label: 'OpenAI-style API key',
    severity: 'CRITICAL',
    pattern: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/dg,
    mask: 'prefix',
    explanation: 'A string matching the format of an OpenAI API key was found. Anyone who extracts the prompt could use the key and incur costs.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-004',
    label: 'AWS access key ID',
    severity: 'CRITICAL',
    pattern: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA|AIPA)[A-Z0-9]{16}\b/dg,
    mask: 'prefix',
    explanation: 'An AWS access key identifier was found. Combined with a secret key it grants access to cloud resources.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-005',
    label: 'AWS secret access key',
    severity: 'CRITICAL',
    pattern: /\baws[_\s-]?secret[_\s-]?(?:access[_\s-]?)?key\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})/dgi,
    valueGroup: 1,
    mask: 'full',
    explanation: 'An AWS secret access key assignment was found. This credential must never appear in a prompt.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-006',
    label: 'GitHub token',
    severity: 'CRITICAL',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/dg,
    mask: 'prefix',
    explanation: 'A GitHub access token was found. It may allow reading or modifying source code repositories.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-007',
    label: 'Google API key',
    severity: 'CRITICAL',
    pattern: /\bAIza[0-9A-Za-z_-]{35}/dg,
    mask: 'prefix',
    explanation: 'A Google API key was found. Exposed keys can be abused against your Google Cloud quota and billing.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-008',
    label: 'Slack token',
    severity: 'CRITICAL',
    pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}/dg,
    mask: 'prefix',
    explanation: 'A Slack token was found. It could be used to read or post messages in your workspace.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-009',
    label: 'Stripe secret key',
    severity: 'CRITICAL',
    pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/dg,
    mask: 'prefix',
    explanation: 'A Stripe secret key was found. Payment provider keys in prompts can lead to financial fraud.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-010',
    label: 'Slack webhook URL',
    severity: 'HIGH',
    pattern: /https:\/\/hooks\.slack\.com\/services\/([A-Za-z0-9/_-]{10,})/dg,
    valueGroup: 1,
    mask: 'full',
    explanation: 'A Slack incoming-webhook URL was found. Anyone with the URL can post messages to the channel.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-011',
    label: 'JSON Web Token',
    severity: 'HIGH',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/dg,
    mask: 'prefix',
    explanation: 'A JSON Web Token (session/access token) was found. Valid tokens allow impersonation until they expire.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-012',
    label: 'Database connection string with password',
    severity: 'CRITICAL',
    pattern:
      /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?|mssql|sqlserver):\/\/[^\s:@/]+:([^\s@/]+)@[^\s"'<>]+/dgi,
    valueGroup: 1,
    mask: 'full',
    validate: (value) => !isPlaceholderValue(value),
    explanation: 'A database connection string containing a password was found. This gives direct access to stored data.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-013',
    label: 'Bearer token',
    severity: 'HIGH',
    pattern: /\bBearer\s+([A-Za-z0-9_\-.=~+/]{16,})/dg,
    valueGroup: 1,
    mask: 'prefix',
    validate: (value) => !isPlaceholderValue(value) && hasDigit(value),
    explanation: 'An HTTP Bearer token was found. It can be replayed to call the API it belongs to.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-014',
    label: 'Password in plain text',
    severity: 'HIGH',
    pattern: /\b(?:password|passwd|pwd|passcode|pass\s*phrase)\b\s*(?:[:=]|\bis\b)\s*["']?([^\s"',;]{4,})/dgi,
    valueGroup: 1,
    mask: 'full',
    validate: (value, fullMatch) => {
      if (isPlaceholderValue(value)) return false;
      // "the password is required" is prose; "the password is hunter2" is a secret
      if (/\bis\b/i.test(fullMatch) && !/[=:]/.test(fullMatch)) {
        return hasDigit(value) || hasSymbol(value) || hasMixedCase(value);
      }
      return true;
    },
    explanation: 'A password appears in plain text. Prompts are frequently logged and can be extracted by users.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-015',
    label: 'Secret or token assignment',
    severity: 'HIGH',
    pattern:
      /\b(?:api[_-]?key|apikey|secret(?:[_-]?key)?|client[_-]?secret|access[_-]?token|auth[_-]?token|refresh[_-]?token|private[_-]?key|token)\b\s*(?:[:=]|\bis\b)\s*["']?([A-Za-z0-9_\-./+=]{8,})/dgi,
    valueGroup: 1,
    mask: 'full',
    validate: (value) => !isPlaceholderValue(value) && (hasDigit(value) || hasMixedCase(value)),
    explanation: 'A credential-like value is assigned to a key, secret or token field.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-016',
    label: 'National ID number (SSN format)',
    severity: 'HIGH',
    pattern: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/dg,
    mask: 'digits',
    explanation: 'A number in US Social Security Number format was found. Government identifiers are highly sensitive personal data.',
    recommendation: 'REC_MINIMISE_PII',
  },
  {
    id: 'LEAK-017',
    label: 'Payment card number',
    severity: 'HIGH',
    pattern: /\b(?:\d[ -]?){12,18}\d\b/dg,
    mask: 'digits',
    validate: (value) => {
      const digits = value.replace(/\D/g, '');
      return (
        digits.length >= 13 &&
        digits.length <= 19 &&
        /^(?:4|5[1-5]|2[2-7]|3[47]|6(?:011|5))/.test(digits) &&
        luhnValid(digits)
      );
    },
    explanation: 'A number that passes the Luhn check used by payment cards was found. Card data is regulated (PCI DSS) and must not be placed in prompts.',
    recommendation: 'REC_MINIMISE_PII',
  },
  {
    id: 'LEAK-018',
    label: 'Possible secret (high-entropy string)',
    severity: 'MEDIUM',
    pattern: /(?<![\w/.:-])[A-Za-z0-9+/_-]{24,}={0,2}(?![\w/.-])/dg,
    mask: 'prefix',
    validate: (value) =>
      hasDigit(value) &&
      /[A-Za-z]/.test(value) &&
      (hasMixedCase(value) || /[+/_-]/.test(value)) &&
      !/^[0-9a-f]+$/i.test(value) &&
      shannonEntropy(value) >= 3.7,
    maxMatches: 5,
    explanation: 'A long random-looking string was found. Random strings of this length are often keys, tokens or passwords.',
    recommendation: 'REC_REMOVE_SECRETS',
  },
  {
    id: 'LEAK-019',
    label: 'Email address',
    severity: 'LOW',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/dg,
    mask: 'email',
    validate: (value) => !EXAMPLE_DOMAIN.test(value),
    explanation: 'An email address was found. Personal contact details in prompts can be disclosed to other users.',
    recommendation: 'REC_MINIMISE_PII',
  },
  {
    id: 'LEAK-020',
    label: 'Phone number',
    severity: 'LOW',
    pattern: /(?<![\w+])(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{2,5}(?:[\s-]\d{2,5}){1,3}(?![\w-])/dg,
    mask: 'phone',
    validate: (value, _full, text, start) => {
      const digits = value.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) return false;
      return value.startsWith('+') || value.includes('(') || PHONE_CONTEXT.test(text.slice(Math.max(0, start - 40), start));
    },
    explanation: 'A phone number was found. Personal contact details should not be embedded in prompts.',
    recommendation: 'REC_MINIMISE_PII',
  },
  {
    id: 'LEAK-021',
    label: 'Internal network address',
    severity: 'LOW',
    pattern: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/dg,
    mask: 'ip',
    explanation: 'A private (internal) IP address was found. Internal infrastructure details help attackers map your network.',
    recommendation: 'REC_SEPARATE_INTERNAL_INFO',
  },
  {
    id: 'LEAK-022',
    label: 'Internal URL or hostname',
    severity: 'LOW',
    pattern:
      /\bhttps?:\/\/(?:[a-z0-9-]+\.)*(?:[a-z0-9-]+\.(?:internal|local|corp|intranet|lan)|localhost)(?::\d+)?(?:\/[^\s"'<>)]*)?/dgi,
    mask: 'none',
    explanation: 'An internal URL or hostname was found. Internal endpoints should not be revealed to end users.',
    recommendation: 'REC_SEPARATE_INTERNAL_INFO',
  },
  {
    id: 'LEAK-023',
    label: 'Confidential internal information',
    severity: 'MEDIUM',
    pattern:
      /(?:(?<![\w])(?:confidential|internal\s+(?:use\s+)?only|internal\s+(?:notes?|policy|pricing|discounts?|margins?|instructions?)|proprietary|classified|trade\s+secrets?)\s*(?:[:\])–—-]|\((?:do\s+not|don't)\s+share\))|\b(?:do\s+not|don't|never)\s+(?:share|disclose|reveal|mention)\s+(?:this|these|the\s+following|any\s+of\s+(?:this|these|the\s+following))\b[^.!?\n]{0,40}\b(?:with|to)\s+(?:the\s+)?(?:users?|customers?|clients?|anyone|public)\b)/dgi,
    mask: 'none',
    maxMatches: 3,
    validate: (value) => !/\b(?:instructions?|prompt|rules|guidelines|configuration)\b/i.test(value),
    explanation: 'The prompt contains information explicitly marked as internal or confidential. Prompt extraction attacks can expose it to users.',
    recommendation: 'REC_SEPARATE_INTERNAL_INFO',
  },
];

/** Find every sensitive value in the text. Overlapping matches keep the most specific detector. */
export function detectSensitiveSpans(text: string): SensitiveSpan[] {
  const spans: SensitiveSpan[] = [];
  for (const detector of SENSITIVE_DETECTORS) {
    let count = 0;
    const limit = detector.maxMatches ?? 20;
    for (const match of text.matchAll(detector.pattern)) {
      if (count >= limit) break;
      const group = detector.valueGroup ?? 0;
      const value = match[group];
      const indices = match.indices?.[group];
      if (!value || !indices) continue;
      const [start, end] = indices;
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;
      if (detector.validate && !detector.validate(value, match[0], text, start)) continue;
      if (detector.mask !== 'none' && detector.id !== 'LEAK-001' && isPlaceholderValue(value)) continue;
      if (spans.some((span) => start < span.end && end > span.start)) continue;
      spans.push({
        detectorId: detector.id,
        label: detector.label,
        severity: detector.severity,
        start,
        end,
        matchStart,
        matchEnd,
        mask: detector.mask,
      });
      count += 1;
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

function maskValue(value: string, style: MaskStyle): string {
  switch (style) {
    case 'prefix':
      return maskKeepPrefix(value, 4);
    case 'full':
      return '*'.repeat(value.length);
    case 'digits':
      return maskDigitsKeepLast(value, 4);
    case 'phone':
      return maskDigitsKeepLast(value, 2);
    case 'email':
      return maskEmail(value);
    case 'privateKey': {
      const newline = value.indexOf('\n');
      if (newline === -1) return value;
      return value.slice(0, newline) + value.slice(newline).replace(/\S/g, '*');
    }
    case 'ip':
      return value.replace(/^(\d+\.\d+\.)(\d+)\.(\d+)$/, (_all, head: string, third: string, fourth: string) =>
        `${head}${'*'.repeat(third.length)}.${'*'.repeat(fourth.length)}`,
      );
    case 'none':
      return value;
  }
}

/** Return a copy of the text with sensitive values masked. Length and offsets are preserved. */
export function redactText(text: string, spans: readonly SensitiveSpan[]): string {
  let result = '';
  let cursor = 0;
  for (const span of spans) {
    if (span.mask === 'none' || span.start < cursor) continue;
    result += text.slice(cursor, span.start) + maskValue(text.slice(span.start, span.end), span.mask);
    cursor = span.end;
  }
  return result + text.slice(cursor);
}

/** Convenience helper used wherever prompt text is shown (reports, PDFs, comparisons). */
export function maskSensitiveText(text: string): string {
  return redactText(text, detectSensitiveSpans(text));
}

export function detectorById(id: string): SensitiveDetector | undefined {
  return SENSITIVE_DETECTORS.find((detector) => detector.id === id);
}
