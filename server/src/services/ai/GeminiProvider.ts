import type { AIProvider, AIReviewFinding } from './AIProvider.js';
import { AIProviderError } from './AIProvider.js';
import { buildReviewUserMessage, parseReviewResponse, REVIEW_SYSTEM_PROMPT } from './review.js';

/** Lighter models tried when the configured one is busy (503/429) or no longer available (404). */
const FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
/** Temporary errors worth retrying: rate limit and server overload. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
/** Wait before each retry of the same model. */
const RETRY_DELAYS_MS = [800, 2000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface GenerateOptions {
  temperature: number;
  json?: boolean;
  maxTokens: number;
}

/** Google Gemini provider (used only when GEMINI_API_KEY is configured). */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini' as const;
  readonly isExternal = true;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  /**
   * Call Gemini, retrying temporary failures (busy or rate limited) and then falling back to
   * lighter models, so a busy moment on Google's side does not drop the scan to Local mode.
   */
  private async generate(system: string, user: string, options: GenerateOptions): Promise<string> {
    const models = [this.model, ...FALLBACK_MODELS.filter((m) => m !== this.model)];
    let lastStatus = 0;
    for (const model of models) {
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        const result = await this.request(model, system, user, options);
        if (typeof result === 'string') return result;
        lastStatus = result.status;
        if (result.status === 404) break; // model retired or unknown: try the next one
        if (!RETRYABLE.has(result.status)) {
          throw new AIProviderError(`Gemini request failed (HTTP ${result.status}).`);
        }
        const delay = RETRY_DELAYS_MS.at(attempt);
        if (delay === undefined) break; // retries used up: try the next model
        await sleep(delay);
      }
    }
    throw new AIProviderError(`Gemini request failed (HTTP ${lastStatus}) after retries and fallback models.`);
  }

  /** One HTTP call. Returns the text, or the HTTP status when the request failed. */
  private async request(
    model: string,
    system: string,
    user: string,
    options: GenerateOptions,
  ): Promise<string | { status: number }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      // The key is sent in a header rather than the URL so it never appears in request logs.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
          ...(options.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) return { status: response.status };

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    if (!text.trim()) throw new AIProviderError('Gemini returned an empty response.');
    return text;
  }

  async reviewPrompt(redactedPrompt: string): Promise<AIReviewFinding[]> {
    const text = await this.generate(REVIEW_SYSTEM_PROMPT, buildReviewUserMessage(redactedPrompt), {
      temperature: 0,
      json: true,
      maxTokens: 2048,
    });
    return parseReviewResponse(text);
  }

  async sampleResponses(systemPrompt: string, userMessage: string, samples: number): Promise<string[]> {
    const responses: string[] = [];
    for (let i = 0; i < samples; i += 1) {
      responses.push(await this.generate(systemPrompt, userMessage, { temperature: 0.7, maxTokens: 512 }));
    }
    return responses;
  }
}
