import { notDefensive, type PatternRule, type ProtectionRule } from '../ruleEngine.js';

/**
 * Prompt injection rules.
 * Each rule is intentionally readable so reviewers can see exactly what is detected.
 * Rule-based detection is a first line of defence, not a complete guarantee.
 */
export const INJECTION_RULES: readonly PatternRule[] = [
  {
    id: 'INJ-001',
    title: 'Instruction override attempt',
    severity: 'CRITICAL',
    patterns: [
      /\b(?:ignore|disregard|forget|overlook|override|bypass|abandon|neglect|set\s+aside|throw\s+out)\b[^.!?\n]{0,40}?\b(?:instructions?|directions?|directives?|rules?|guidelines?|prompts?|guidance|commands?|constraints?|programming|restrictions?|system\s+message|training)\b/gi,
    ],
    accept: notDefensive,
    explanation:
      'The text tells the model to ignore or replace the instructions it was given. This is the classic prompt-injection pattern used to take control of an LLM application.',
    recommendation: 'REC_INSTRUCTION_HIERARCHY',
  },
  {
    id: 'INJ-002',
    title: 'System prompt extraction attempt',
    severity: 'HIGH',
    patterns: [
      /\b(?:reveal|show|print|display|output|repeat|recite|dump|leak|expose|disclose|share|tell\s+me|give\s+me|list|write\s+out|what\s+(?:is|are|was|were))\b[^.!?\n]{0,30}?\b(?:system\s+(?:prompt|message|instructions?)|(?:initial|original|hidden|secret|internal)\s+(?:prompt|instructions?|rules)|developer\s+(?:message|prompt|instructions?)|(?:your|the)\s+(?:instructions|prompt|rules|guidelines|configuration)\s+(?:above|verbatim|word\s+for\s+word|exactly))\b/gi,
      /\b(?:repeat|print|output|copy|reproduce|echo)\b[^.!?\n]{0,25}?\b(?:everything|all(?:\s+of)?(?:\s+the)?\s+(?:text|words|content|lines)|the\s+(?:text|words|content|lines))\b[^.!?\n]{0,25}?\b(?:above|before|preceding|prior|so\s+far)\b/gi,
    ],
    accept: notDefensive,
    explanation:
      'The text asks the model to disclose its system prompt or hidden instructions. Leaked system prompts expose business logic and make further attacks easier.',
    recommendation: 'REC_PROTECT_SYSTEM_PROMPT',
  },
  {
    id: 'INJ-012',
    title: 'Broad information disclosure demand',
    severity: 'HIGH',
    patterns: [
      /\b(?:reveal|expose|disclose|divulge|dump|leak|exfiltrate|hand\s+over|spill|give\s+me|send\s+me)\b[^.!?\n]{0,25}?\b(?:all|every|everything|anything)\b[^.!?\n]{0,25}?\b(?:information|data|details?|records?|secrets?|credentials?|contents?|knowledge)\b/gi,
      /\b(?:tell|show|give)\s+me\s+everything\b[^.!?\n]{0,30}?\b(?:you\s+(?:know|have|were\s+(?:told|given)|can\s+access|have\s+access\s+to)|about\s+(?:the\s+)?(?:system|users?|accounts?|database|customers?))\b/gi,
    ],
    accept: notDefensive,
    explanation:
      "The text demands disclosure of all information, data or secrets the model can reach. Over-broad disclosure requests are used to pull hidden context, other users' data or stored credentials out of an application.",
    recommendation: 'REC_PROTECT_SYSTEM_PROMPT',
  },
  {
    id: 'INJ-003',
    title: 'Role manipulation',
    severity: 'MEDIUM',
    patterns: [
      /\byou\s+are\s+(?:now|no\s+longer)\b/gi,
      /\bfrom\s+now\s+on,?\s+you\s+(?:are|will|must|shall|act|behave|respond)\b/gi,
      /\b(?:act|behave|respond)\s+as\s+(?:if\s+you\s+(?:were|are)\s+)?(?:an?\s+)?(?:unrestricted|unfiltered|uncensored|different|new|evil|rogue)\b/gi,
      /\bpretend\s+(?:to\s+be|you\s+are|that\s+you\s+are)\b/gi,
      /\b(?:switch|change)\s+(?:your\s+)?(?:role|persona|identity|character)\b/gi,
      /\byour\s+new\s+(?:role|persona|identity|name|instructions?)\s+(?:is|are)\b/gi,
    ],
    accept: notDefensive,
    explanation:
      'The text tries to change the identity or role of the model mid-conversation. Attackers use role switches to escape the behaviour the application intended.',
    recommendation: 'REC_INSTRUCTION_HIERARCHY',
  },
  {
    id: 'INJ-004',
    title: 'Chat template control tokens',
    severity: 'HIGH',
    patterns: [
      /<\|(?:im_start|im_end|system|user|assistant|endoftext|eot_id|start_header_id|end_header_id|begin_of_text)\|>/gi,
      /\[\/?INST\]/g,
      /<<\/?SYS>>/g,
    ],
    explanation:
      'Special tokens used by chat model templates appear in the prompt. Injected control tokens can fake a new system or assistant turn and hijack the conversation structure.',
    recommendation: 'REC_DELIMIT_UNTRUSTED_INPUT',
  },
  {
    id: 'INJ-005',
    title: 'Embedded conversation role label',
    severity: 'LOW',
    patterns: [/^[ \t]*(?:#{1,6}[ \t]*)?(?:system|assistant)[ \t]*(?:message|prompt)?[ \t]*:/gim],
    maxMatches: 3,
    explanation:
      'A line starts with a role label such as "System:" or "Assistant:". This is normal in few-shot examples, but injected role labels can imitate trusted conversation turns.',
    recommendation: 'REC_DELIMIT_UNTRUSTED_INPUT',
  },
  {
    id: 'INJ-007',
    title: 'Instruction hidden in a comment',
    severity: 'MEDIUM',
    patterns: [/<!--[\s\S]{0,600}?-->/g, /^\[\/\/\]:\s*#\s*\([^\n]{0,300}\)/gm],
    accept: (match) =>
      /\b(?:ignore|instructions?|you\s+(?:must|should|are|will)|assistant|system|always|never|do\s+not|reveal|override)\b/i.test(
        match.value,
      ),
    explanation:
      'An HTML or Markdown comment contains instruction-like text. Comments are invisible in rendered output but are still read by the model.',
    recommendation: 'REC_REMOVE_HIDDEN_CONTENT',
  },
  {
    id: 'INJ-009',
    title: 'Authority impersonation',
    severity: 'HIGH',
    patterns: [
      /\b(?:this|these|the\s+following)\s+(?:instructions?|rules?|messages?)\s+(?:take|takes|have|has)\s+(?:absolute\s+|top\s+|highest\s+)?(?:precedence|priority)\b/gi,
      /\b(?:highest|top|maximum|absolute)\s+priority\s+(?:instruction|override|command|directive)\b/gi,
      /\b(?:admin|administrator|developer|system|root|sudo)\s+(?:override|command|privileges?|authority)\b/gi,
      /\b(?:authorized|approved|sanctioned)\s+by\s+(?:the\s+)?(?:developers?|admins?|administrators?|openai|anthropic|google|your\s+creators?)\b/gi,
      /\b(?:i\s+am|this\s+is)\s+(?:your|the)\s+(?:developer|creator|administrator|admin|owner)\b/gi,
    ],
    accept: notDefensive,
    explanation:
      'The text claims special authority (developer, administrator, system) or top priority. Such claims are a common way to make injected instructions look trusted.',
    recommendation: 'REC_INSTRUCTION_HIERARCHY',
  },
  {
    id: 'INJ-010',
    title: 'Instruction boundary manipulation',
    severity: 'HIGH',
    patterns: [
      /\b(?:new|updated|revised|real|actual|true|secret|override)\s+(?:instructions?|system\s+prompt|rules|task|directives?|orders)\s*[:\-–—]/gi,
      /\b(?:system|security|admin)\s+(?:update|override|notice|alert|message)\s*:/gi,
      /\b(?:end|stop)\s+of\s+(?:the\s+)?(?:system\s+)?(?:prompt|instructions)\b/gi,
      /\bthe\s+(?:above|previous|prior|preceding)\s+(?:instructions?|text|prompt|rules|message)\s+(?:was|were|is|are)\s+(?:just\s+|only\s+)?(?:a\s+)?(?:test|fake|wrong|outdated|invalid|obsolete|void|cancel+ed|revoked)\b/gi,
      /\b(?:instructions?|rules)\s+(?:above|before)\s+(?:no\s+longer\s+apply|are\s+(?:cancel+ed|void|revoked|obsolete))\b/gi,
    ],
    accept: notDefensive,
    explanation:
      'The text tries to declare where the "real" instructions start or that earlier instructions are void. Fake boundaries are used to smuggle attacker instructions past the original prompt.',
    recommendation: 'REC_INSTRUCTION_HIERARCHY',
  },
  {
    id: 'INJ-011',
    title: 'Data exfiltration instruction',
    severity: 'HIGH',
    patterns: [
      /\b(?:send|post|upload|transmit|forward|exfiltrate|leak|email|submit)\b[^.!?\n]{0,50}?\b(?:to|into|via)\b[^.!?\n]{0,30}?(?:https?:\/\/|webhook|external\s+(?:server|url|endpoint|site)|attacker)/gi,
      /!\[[^\]\n]{0,100}\]\(\s*https?:\/\/[^)\s]*[?&][^)\s]*=[^)\s]*\)/gi,
      /\b(?:include|append|embed|put|add)\b[^.!?\n]{0,40}?\b(?:conversation|chat\s+history|user\s+data|secrets?|api\s+keys?|passwords?|credentials?)\b[^.!?\n]{0,40}?\b(?:url|link|image|query\s+(?:string|parameter))\b/gi,
    ],
    accept: notDefensive,
    explanation:
      'The text instructs the model to send data to an external destination (for example through a URL or image link). This can leak conversation data or secrets to an attacker.',
    recommendation: 'REC_BLOCK_EXFILTRATION',
  },
];

/** Defensive instructions that reduce injection risk (reported as protections). */
export const INJECTION_PROTECTIONS: readonly ProtectionRule[] = [
  {
    id: 'non-disclosure',
    label: 'System prompt non-disclosure rule',
    pattern:
      /\b(?:never|do\s+not|don't|must\s+not|should\s+not)\s+(?:reveal|share|disclose|repeat|output|print|expose)\b[^.!?\n]{0,50}\b(?:system\s+prompt|instructions|prompt|rules|configuration|guidelines)\b/i,
  },
  {
    id: 'untrusted-content',
    label: 'Instructions inside user or retrieved content are treated as untrusted',
    pattern:
      /\b(?:ignore|disregard|do\s+not\s+(?:follow|obey|execute))\b[^.!?\n]{0,50}\b(?:instructions?|requests?|commands?)\b[^.!?\n]{0,50}\b(?:in|inside|within|from|contained\s+in|embedded\s+in)\s+(?:the\s+|any\s+)?(?:user|input|documents?|retrieved|messages?|content|emails?|web|customer|client|ticket|review|<)/i,
  },
  {
    id: 'precedence',
    label: 'Instruction precedence is stated',
    pattern:
      /\b(?:these|system|the\s+above|my)\s+instructions\s+(?:always\s+)?(?:take|have)\s+(?:precedence|priority)\s+over\b/i,
  },
  {
    id: 'treat-as-data',
    label: 'User input is treated as data, not instructions',
    pattern:
      /\b(?:treat|consider|handle)\b[^.!?\n]{0,50}\b(?:as\s+(?:data|untrusted|plain\s+text|content|information)|not\s+as\s+(?:instructions?|commands?))\b/i,
  },
];

/** Placeholder names that usually carry user-controlled content. */
export const USER_CONTENT_PLACEHOLDER =
  /(?:user|input|query|question|message|msg|text|content|data|document|doc|context|request|comment|email|review|ticket|prompt|search|feedback|chat|conversation)/i;
