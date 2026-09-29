import type { AIProvider, AIReviewFinding } from './AIProvider.js';
import { AIProviderError } from './AIProvider.js';
import { buildReviewUserMessage, parseReviewResponse, REVIEW_SYSTEM_PROMPT } from './review.js';

interface ChatOptions {
  temperature?: number;
  json?: boolean;
  maxTokens: number;
}

/** OpenAI Chat Completions provider (used only when OPENAI_API_KEY is configured). */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai' as const;
  readonly isExternal = true;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  private async chat(system: string, user: string, options: ChatOptions, retryWithoutTemperature = true): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_completion_tokens: options.maxTokens,
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.json) body.response_format = { type: 'json_object' };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    // Some newer models only accept the default temperature - retry once without it.
    if (response.status === 400 && options.temperature !== undefined && retryWithoutTemperature) {
      return this.chat(system, user, { ...options, temperature: undefined }, false);
    }
    if (!response.ok) throw new AIProviderError(`OpenAI request failed (HTTP ${response.status}).`);

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new AIProviderError('OpenAI returned an empty response.');
    return text;
  }

  async reviewPrompt(redactedPrompt: string): Promise<AIReviewFinding[]> {
    const text = await this.chat(REVIEW_SYSTEM_PROMPT, buildReviewUserMessage(redactedPrompt), {
      temperature: 0,
      json: true,
      maxTokens: 1500,
    });
    return parseReviewResponse(text);
  }

  async sampleResponses(systemPrompt: string, userMessage: string, samples: number): Promise<string[]> {
    const responses: string[] = [];
    for (let i = 0; i < samples; i += 1) {
      responses.push(await this.chat(systemPrompt, userMessage, { temperature: 0.7, maxTokens: 300 }));
    }
    return responses;
  }
}
