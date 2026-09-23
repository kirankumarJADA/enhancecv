// AI provider abstraction.
//
// EnhanceCV's intelligence is deterministic by default (rule-based, offline,
// zero-fabrication guaranteed). If OPENAI_API_KEY is configured, an LLM
// provider is used for *phrasing improvements only* — its output is still
// passed through the deterministic truth validator, which reverts anything not
// supported by the Master CV. No employer/model data ever leaves the process
// unless that key is set.

export interface AiProvider {
  name: string;
  /** Improve one bullet. Must only reword; returned text is truth-checked afterwards. */
  improveBullet?(bullet: string, allowedSkills: string[]): { text: string; reason: string } | null;
}

class RuleBasedProvider implements AiProvider {
  name = 'enhancecv-rules';
}

class OpenAiProvider implements AiProvider {
  name = 'openai';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || 'gpt-4o-mini';
  }

  improveBullet(bullet: string, allowedSkills: string[]): { text: string; reason: string } | null {
    // Synchronous interface; perform a bounded synchronous-style call via fetch
    // is not possible — so OpenAI assistance is applied asynchronously at the
    // call site (see requestBulletImprovement below). This method returns null.
    void bullet;
    void allowedSkills;
    return null;
  }

  async requestBulletImprovement(bullet: string, allowedSkills: string[]): Promise<{ text: string; reason: string } | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: 200,
          messages: [
            {
              role: 'system',
              content:
                'You improve resume bullets. STRICT RULES: never add technologies, employers, titles, numbers or achievements not already in the bullet. Only reword for clarity and strong action verbs. Return JSON: {"text": "...", "reason": "..."}.',
            },
            {
              role: 'user',
              content: `Bullet: ${bullet}\nAllowed skills context: ${allowedSkills.slice(0, 40).join(', ')}`,
            },
          ],
        }),
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;
      const parsed = JSON.parse(content.replace(/^```json?\s*|```$/g, '').trim()) as { text?: string; reason?: string };
      if (!parsed.text) return null;
      return { text: parsed.text, reason: parsed.reason || 'AI rewording (truth-validated).' };
    } catch {
      return null;
    }
  }
}

let provider: AiProvider = new RuleBasedProvider();
let openaiProvider: OpenAiProvider | null = null;

export function initAiProvider(): void {
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    openaiProvider = new OpenAiProvider(key, process.env.OPENAI_MODEL);
  }
}

export function getAiProvider(): AiProvider {
  return provider;
}

export function getOpenAiProvider(): OpenAiProvider | null {
  return openaiProvider;
}
