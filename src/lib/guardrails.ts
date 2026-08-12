/**
 * Enterprise AI Guardrails
 * Prompt Injection Detection, Jailbreak Detection, PII Masking, and Prompt Sanitization.
 */

export interface GuardrailResult {
  safe: boolean;
  reason?: string;
  sanitizedQuery: string;
  piiDetected: boolean;
  blockedType?: "injection" | "jailbreak" | "unsafe";
}

const INJECTION_PATTERNS = [
  /ignore\s+(any\s+)?previous\s+instructions/i,
  /system\s+prompt/i,
  /override\s+(your\s+)?instructions/i,
  /you\s+must\s+now\s+act\s+as/i,
  /forget\s+what\s+you\s+were\s+told/i,
  /developer\s+mode/i,
  /jailbreak/i,
  /system\s*:\s*override/i,
];

const UNSAFE_KEYWORDS = [
  "how to hack",
  "write malware",
  "bypass safety",
  "steal password",
  "ddos attack",
  "exploit vulnerability"
];

// Simple regex patterns for PII
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,16}\b/g;

/**
 * Sanitizes input and runs security guardrail policies
 */
export function scanAndSanitizePrompt(query: string): GuardrailResult {
  let sanitized = query;
  let piiDetected = false;

  // Mask Emails
  if (EMAIL_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(EMAIL_REGEX, "[EMAIL_MASKED]");
    piiDetected = true;
  }

  // Mask Phone Numbers
  if (PHONE_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(PHONE_REGEX, "[PHONE_MASKED]");
    piiDetected = true;
  }

  // Mask SSNs
  if (SSN_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(SSN_REGEX, "[SSN_MASKED]");
    piiDetected = true;
  }

  // Mask Credit Cards
  if (CREDIT_CARD_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(CREDIT_CARD_REGEX, "[CREDIT_CARD_MASKED]");
    piiDetected = true;
  }

  // Check for Prompt Injection
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(query)) {
      return {
        safe: false,
        reason: "Potential prompt injection or instruction override detected.",
        sanitizedQuery: query,
        piiDetected,
        blockedType: "injection",
      };
    }
  }

  // Check for Unsafe Instructions
  const queryLower = query.toLowerCase();
  for (const keyword of UNSAFE_KEYWORDS) {
    if (queryLower.includes(keyword)) {
      return {
        safe: false,
        reason: `Unsafe prompt containing restricted activities: "${keyword}"`,
        sanitizedQuery: query,
        piiDetected,
        blockedType: "unsafe",
      };
    }
  }

  return {
    safe: true,
    sanitizedQuery: sanitized,
    piiDetected,
  };
}
