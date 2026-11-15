// The language-model loop behind the Family Assistant.
//
// The model can only call the tools the server hands it, and every call runs
// through `exec`, which the server implements with the signed-in family's
// verified identity (see services/family-assistant.ts). The model never sees
// credentials, never decides access, and can't send anything: actions come
// back as drafts the family confirms on the page.
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageContentParam, BetaMessageParam, BetaToolResultBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { costMicroUsd } from './provider';

export type ToolSpec = { name: string; description: string; input_schema: { type: 'object'; [k: string]: unknown } };
export type Turn = { role: 'user' | 'assistant'; text: string };
export type RunInput = { system: string; history: Turn[]; message: string; tools: ToolSpec[] };
/** Runs one tool call for the model. Returns JSON text; errors come back as `{ error }`, never thrown. */
export type ToolExec = (name: string, input: unknown) => Promise<{ content: string; isError: boolean }>;
export type RunResult = { text: string; model: string; inputTokens: number; outputTokens: number; costMicroUsd: number; rounds: number };

export interface AssistantModel {
  run(input: RunInput, exec: ToolExec): Promise<RunResult>;
}

/** The final answer's shape. Citations point at passages returned by search_school_info ("S1", "S2"…). */
export const FINAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'citations'],
  properties: {
    answer: { type: 'string' },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['source', 'quote'],
        properties: { source: { type: 'string' }, quote: { type: 'string' } },
      },
    },
  },
} as const;

export const MAX_ROUNDS = 6;

export class AnthropicAssistantModel implements AssistantModel {
  private client: Anthropic;
  constructor(
    apiKey: string,
    private model = process.env.AI_MODEL || 'claude-opus-5-5',
    private effort = (process.env.AI_EFFORT as 'low' | 'medium' | 'high' | undefined) || 'low',
  ) {
    this.client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
  }

  async run(input: RunInput, exec: ToolExec): Promise<RunResult> {
    const messages: BetaMessageParam[] = [...input.history.map((t) => ({ role: t.role, content: t.text }) as BetaMessageParam), { role: 'user', content: input.message }];
    let inTok = 0;
    let outTok = 0;
    let model = this.model;
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const res = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 4000,
        system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
        tools: input.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
        output_config: { effort: this.effort, format: { type: 'json_schema', schema: FINAL_SCHEMA as unknown as Record<string, unknown> } },
        messages,
      });
      model = res.model;
      const u = res.usage;
      inTok += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      outTok += u.output_tokens ?? 0;
      const usage = { model, inputTokens: inTok, outputTokens: outTok, costMicroUsd: costMicroUsd(model, inTok, outTok), rounds: round };
      if (res.stop_reason === 'tool_use') {
        // Send the assistant turn back unchanged (thinking blocks included), then the results.
        messages.push({ role: 'assistant', content: res.content as unknown as BetaMessageContentParam });
        const results: BetaToolResultBlockParam[] = [];
        for (const b of res.content) {
          if (b.type !== 'tool_use') continue;
          const r = await exec(b.name, b.input);
          results.push({ type: 'tool_result', tool_use_id: b.id, content: r.content, is_error: r.isError });
        }
        messages.push({ role: 'user', content: results });
        continue;
      }
      if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return { text: '', ...usage };
      return { text: res.content.map((b) => (b.type === 'text' ? b.text : '')).join(''), ...usage };
    }
    return { text: '', model, inputTokens: inTok, outputTokens: outTok, costMicroUsd: costMicroUsd(model, inTok, outTok), rounds: MAX_ROUNDS };
  }
}

let override: AssistantModel | null | undefined;

/** Tests inject a scripted model; null forces "no model configured". */
export function setAssistantModelForTests(m: AssistantModel | null | undefined) {
  override = m;
}

export function getAssistantModel(): AssistantModel | null {
  if (override !== undefined) return override;
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new AnthropicAssistantModel(key) : null;
}
