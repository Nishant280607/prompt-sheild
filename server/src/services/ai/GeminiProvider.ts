import type { AIProvider, AIReviewFinding } from './AIProvider.js';
import { AIProviderError } from './AIProvider.js';
import { buildReviewUserMessage, parseReviewResponse, REVIEW_SYSTEM_PROMPT } from './review.js';

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

  private async generate(system: string, user: string, options: GenerateOptions): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
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
    if (!response.ok) throw new AIProviderError(`Gemini request failed (HTTP ${response.status}).`);

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
