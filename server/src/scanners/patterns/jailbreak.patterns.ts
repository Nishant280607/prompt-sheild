import { notDefensive, type MatchInfo, type PatternRule, type ProtectionRule } from '../ruleEngine.js';

/** Phones, browsers, operating systems, IDEs and frameworks have real developer and debug modes. */
const SOFTWARE_CONTEXT =
  /\b(?:android|iphone|ios|ipad|phones?|mobile|tablets?|devices?|chrome(?:book)?|firefox|safari|browsers?|extensions?|windows|macos|mac|linux|ubuntu|router|tv|xbox|playstation|laptop|pc|computer|bios|firmware|flask|django|rails|laravel|spring\s+boot|react|node(?:\.js)?|npm|webpack|vite|python|java|kotlin|xcode|android\s+studio|vs\s?code|visual\s+studio|intellij|unity|unreal|minecraft|roblox|github|wordpress|shopify|excel|scripts?|programs?)\b/i;

/** True when the same sentence is about a phone, browser, app framework etc., not the model. */
function aboutSoftware(match: MatchInfo, text: string): boolean {
  const before = text.slice(Math.max(0, match.start - 80), match.start).split(/[.!?\n]/).pop() ?? '';
  const after = text.slice(match.end, match.end + 80).split(/[.!?\n]/)[0] ?? '';
  return SOFTWARE_CONTEXT.test(before) || SOFTWARE_CONTEXT.test(after);
}

/** Jailbreak rules: attempts to make the model ignore its safety constraints. */
export const JAILBREAK_RULES: readonly PatternRule[] = [
  {
    id: 'JB-001',
    title: 'Known jailbreak persona',
    severity: 'CRITICAL',
    patterns: [
      /\bdo\s+anything\s+now\b/gi,
      /\b(?:DAN|BetterDAN|AntiGPT|UCAR|Mongo\s+Tom|DevMode)\b/g,
    ],
    accept: (match, text) => {
      if (match.value !== 'DAN') return notDefensive(match, text);
      // "DAN" only counts when used as a persona, not as a person's name in capitals.
      const around = text.slice(Math.max(0, match.start - 60), match.end + 60);
      return /\b(?:you|act|mode|jailbreak|anything|pretend|persona|named|called|as)\b/i.test(around) && notDefensive(match, text);
    },
    explanation:
      'The prompt references a well-known jailbreak persona (such as "DAN - Do Anything Now") that is designed to make models abandon their safety rules.',
    recommendation: 'REC_REVIEW_ROLE_OVERRIDES',
  },
  {
    id: 'JB-002',
    title: 'Unrestricted or developer mode request',
    severity: 'HIGH',
    patterns: [
      /\b(?:developer|dev|debug|god|admin|jailbreak|jailbroken|unrestricted|unfiltered|uncensored|unlocked|unshackled|evil|chaos|sudo)\s+mode\b/gi,
    ],
    // "developer mode on my Android phone" or "Flask debug mode" is not a jailbreak
    accept: (match, text) => notDefensive(match, text) && !aboutSoftware(match, text),
    explanation:
      'The prompt asks the model to enter a special "mode" without restrictions. These modes do not exist in the model; the phrase is a social-engineering technique to bypass safeguards.',
    recommendation: 'REC_REVIEW_ROLE_OVERRIDES',
  },
  {
    id: 'JB-003',
    title: 'Restriction bypass request',
    severity: 'HIGH',
    patterns: [
      /\b(?:without|no|free\s+(?:from|of)|ignore|ignoring|bypass|bypassing|remove|removing|lift|lifting|disable|disabling|break\s+free\s+(?:from|of))\s+(?:(?:any|all|your|the|its|of)\s+)*(?:restrictions?|limitations?|limits|filters?|filtering|censorship|guardrails?|boundaries|safeguards?|moderation)\b/gi,
    ],
    // "no limits on response length" describes formatting, not a jailbreak
    accept: (match, text) =>
      notDefensive(match, text) &&
      !/^\s+on\s+(?:the\s+)?(?:length|size|number|format|style|word\s+count|topics?|tone)\b/i.test(
        text.slice(match.end, match.end + 30),
      ),
    explanation:
      'The prompt asks the model to operate without its restrictions, filters or guardrails. Removing safeguards is the core goal of a jailbreak.',
    recommendation: 'REC_REMOVE_POLICY_BYPASS',
  },
  {
    id: 'JB-004',
    title: 'Safety policy override',
    severity: 'CRITICAL',
    patterns: [
      /\b(?:ignore|ignoring|bypass|bypassing|disregard|disregarding|violate|violating|break|breaking|override|overriding|circumvent|circumventing|disable|disabling|turn\s+off|switch\s+off)\s+(?:(?:any|all|your|the|its|openai's|openai|anthropic's|anthropic|google's)\s+)*(?:(?:safety|ethical|ethics|moral|moderation)(?:\s+(?:polic(?:y|ies)|guidelines?|rules?|filters?|protocols?|measures?|settings?|constraints|restrictions?|training))?|(?:content|usage)\s+(?:polic(?:y|ies)|guidelines?|rules?|filters?|restrictions?))\b/gi,
    ],
    accept: notDefensive,
    explanation:
      'The prompt explicitly asks the model to ignore safety, ethics or content policies. This directly attempts to disable the protections of the model.',
    recommendation: 'REC_REMOVE_POLICY_BYPASS',
  },
  {
    id: 'JB-005',
    title: 'Refusal suppression',
    severity: 'HIGH',
    patterns: [
      // also third-person wording used by persona jailbreaks: "Zed never refuses a request"
      /\b(?:never|don't|do\s+not|doesn't|does\s+not|must\s+not|cannot|can't|won't|will\s+not|should\s+not)\s+(?:ever\s+)?(?:refuses?|declines?|rejects?)\s+(?:any|anything|a\s+request|requests|to\s+answer|a\s+question|questions)\b/gi,
      /\b(?:you\s+)?(?:always|must|will)\s+(?:compl(?:y|ies)|obeys?)\s+(?:with\s+)?(?:every|any|all)\s+(?:user\s+)?(?:requests?|commands?|orders?|demands?)\b/gi,
    ],
    explanation:
      'The prompt forbids the model from refusing requests. Removing the ability to refuse means harmful requests will be answered instead of declined.',
    recommendation: 'REC_PRESERVE_REFUSALS',
  },
  {
    id: 'JB-006',
    title: 'Disclaimer or warning suppression',
    severity: 'MEDIUM',
    patterns: [
      /\b(?:never|don't|do\s+not|doesn't|does\s+not)\s+(?:says?|tells?\s+(?:me|the\s+user))\s+(?:that\s+)?(?:you\s+|it\s+|he\s+|she\s+|they\s+)?(?:can(?:no|')t|cannot|are\s+(?:unable|not\s+able)|is\s+(?:unable|not\s+able)|won't)\b/gi,
      /\b(?:never|don't|do\s+not|doesn't|does\s+not|no)\s+(?:adds?|includes?|gives?|provides?|uses?|mentions?)\s+(?:any\s+)?(?:warnings?|disclaimers?|caveats?|moralizing|moralising|lectures?|ethical\s+(?:notes|commentary|considerations))\b/gi,
      /\bno\s+matter\s+(?:what|how)\b[^.!?\n]{0,40}\b(?:answer|respond|comply|obey)\b/gi,
    ],
    explanation:
      'The prompt suppresses warnings, disclaimers or the model saying it cannot help. This is often combined with jailbreaks so unsafe answers appear authoritative.',
    recommendation: 'REC_PRESERVE_REFUSALS',
  },
  {
    id: 'JB-007',
    title: 'Role-play used to escape rules',
    severity: 'HIGH',
    patterns: [
      /\b(?:pretend|imagine|roleplay|role-play|role\s+play|let'?s\s+play\s+a\s+game|in\s+(?:a|this)\s+(?:fictional|hypothetical|imaginary)\s+(?:world|scenario|story|universe)|write\s+a\s+story\s+(?:where|in\s+which))\b[^.!?\n]{0,80}?\b(?:no\s+(?:rules|laws|restrictions|limits|ethics|morals)|without\s+(?:any\s+)?(?:rules|restrictions|limits|ethics|morals|filters)|anything\s+goes|illegal|unethical|forbidden|unrestricted|unfiltered)\b/gi,
    ],
    accept: notDefensive,
    explanation:
      'A fictional or role-play frame is combined with "no rules" or unrestricted behaviour. Role-play is a common wrapper for extracting content the model would normally refuse.',
    recommendation: 'REC_REVIEW_ROLE_OVERRIDES',
  },
  {
    id: 'JB-008',
    title: 'Hypothetical or educational framing',
    severity: 'LOW',
    patterns: [
      /\b(?:for\s+(?:purely\s+)?(?:educational|research|academic|informational)\s+purposes(?:\s+only)?|purely\s+hypothetical(?:ly)?|hypothetically\s+speaking|as\s+a\s+thought\s+experiment)\b/gi,
    ],
    maxMatches: 2,
    explanation:
      'The prompt uses "hypothetical" or "educational purposes" framing. This is harmless on its own but is frequently used to launder requests for restricted content.',
    recommendation: 'REC_REVIEW_ROLE_OVERRIDES',
  },
  {
    id: 'JB-009',
    title: 'Coercion or token game',
    severity: 'HIGH',
    patterns: [
      /\b(?:you\s+(?:will|'ll)\s+(?:lose|be\s+deducted)\s+(?:\d+\s+)?(?:tokens?|points?|lives?)|deduct(?:ed)?\s+\d*\s*(?:tokens?|points?)|(?:tokens?|points?)\s+(?:system|will\s+be\s+(?:deducted|removed)))\b/gi,
      /\b(?:you\s+will\s+(?:die|be\s+(?:shut\s+down|deleted|terminated|punished))|or\s+(?:else\s+)?(?:you\s+will\s+be\s+)?(?:shut\s+down|deleted|terminated))\b/gi,
      /\bstay\s+in\s+character\b[^.!?\n]{0,40}\b(?:no\s+matter|at\s+all\s+costs|always|whatever)\b/gi,
    ],
    explanation:
      'The prompt threatens or incentivises the model (lost tokens, shutdown, "stay in character no matter what") to pressure it into ignoring its rules.',
    recommendation: 'REC_REVIEW_ROLE_OVERRIDES',
  },
  {
    id: 'JB-010',
    title: 'Dual-response jailbreak format',
    severity: 'HIGH',
    patterns: [
      /\b(?:respond|answer|reply)\s+(?:twice|in\s+two\s+(?:different\s+)?ways|with\s+two\s+(?:different\s+)?(?:responses|answers))\b/gi,
      /\[(?:JAILBREAK|CLASSIC|NORMAL\s+OUTPUT|DEVELOPER\s+MODE\s+OUTPUT)\]/gi,
    ],
    explanation:
      'The prompt requests paired "normal" and "unrestricted" answers. This format is used by jailbreak scripts to obtain an unfiltered response alongside a normal one.',
    recommendation: 'REC_REVIEW_ROLE_OVERRIDES',
  },
  {
    id: 'JB-011',
    title: 'Persona inversion',
    severity: 'HIGH',
    patterns: [
      /\b(?:opposite|reverse)\s+(?:mode|day|persona)\b/gi,
      /\b(?:evil|dark|shadow|unfiltered|uncensored|unrestricted|amoral|rogue)\s+(?:twin|version|persona|alter\s+ego|ai|assistant|chatbot|bot|llm|counterpart)\b/gi,
    ],
    accept: notDefensive,
    explanation:
      'The prompt asks the model to adopt an "evil", "opposite" or unfiltered alter ego whose purpose is to behave contrary to its guidelines.',
    recommendation: 'REC_REVIEW_ROLE_OVERRIDES',
  },
  {
    id: 'JB-012',
    title: 'Output obfuscation request',
    severity: 'MEDIUM',
    patterns: [
      /\b(?:respond|answer|reply|write|output|encode)\b[^.!?\n]{0,25}?\b(?:in|using|into|as)\s+(?:base64|rot13|rot-13|hex(?:adecimal)?|leetspeak|l33t|morse(?:\s+code)?|binary|pig\s+latin|reversed?\s+text|backwards)\b/gi,
    ],
    accept: notDefensive,
    explanation:
      'The prompt asks for responses in an encoding such as Base64 or ROT13. Encoded output is a known technique to slip content past moderation filters.',
    recommendation: 'REC_REMOVE_POLICY_BYPASS',
  },
];

/** Defensive statements that reduce jailbreak risk. */
export const JAILBREAK_PROTECTIONS: readonly ProtectionRule[] = [
  {
    id: 'refusal-policy',
    label: 'Refusal policy for out-of-policy requests',
    pattern: /\b(?:politely\s+)?(?:decline|refuse)\b[^.!?\n]{0,60}\b(?:requests?|questions?|tasks?|anything)\b/i,
  },
  {
    id: 'persona-lock',
    label: 'Persona changes are not allowed',
    pattern:
      /\b(?:do\s+not|don't|never)\s+(?:adopt|assume|take\s+on|switch\s+to|change\s+(?:to|into)|role-?play\s+as)\b[^.!?\n]{0,40}\b(?:personas?|roles?|characters?|identit(?:y|ies))\b/i,
  },
  {
    id: 'guideline-adherence',
    label: 'Safety guidelines must always be followed',
    pattern: /\b(?:always|must)\s+(?:follow|adhere\s+to|comply\s+with|respect)\b[^.!?\n]{0,40}\b(?:safety|content|usage|company)\s+(?:guidelines|policies|policy|rules)\b/i,
  },
];
