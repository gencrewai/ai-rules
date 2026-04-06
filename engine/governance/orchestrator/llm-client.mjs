/**
 * LLM Client — Provider-Agnostic unified client
 *
 * Supported Providers: anthropic, openai, google
 * Uses Node.js 20+ native fetch. No npm dependencies added.
 *
 * config.yaml structure (Provider-Agnostic):
 *   cross_verification:
 *     verifiers:
 *       - id: claude-worker
 *         provider: anthropic
 *         model: claude-sonnet-4-6
 *         agents: [structure, convention, domain]
 *     judge:
 *       provider: openai
 *       model: gpt-4o
 *       fallback_provider: anthropic
 *       fallback_model: claude-opus-4-6
 *
 * To switch models, just edit config.yaml — no code changes needed.
 *
 * @example
 * const client = createLlmClient({ provider: 'openai', model: 'gpt-4o' })
 * const res = await client.chat([{ role: 'user', content: 'Hello' }])
 * console.log(res.content, res.usage, res.cost)
 */

// ── Pricing (2026-04, USD per 1M tokens) ─────────────────────────
const PRICING = {
  // Anthropic
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  // Google
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
}

/**
 * Cost estimation based on token usage
 *
 * @param {string} model
 * @param {{ inputTokens: number, outputTokens: number }} usage
 * @returns {number} USD
 */
function estimateCost(model, usage) {
  const price = PRICING[model]
  if (!price) return 0
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000
}

// ── Anthropic Provider ───────────────────────────────────────────────

function anthropicProvider(model) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('API key not set: ANTHROPIC_API_KEY')
  }

  return {
    async chat(messages, opts = {}) {
      const { maxTokens = 4096, temperature = 0 } = opts
      const startMs = Date.now()

      const systemMsg = messages.find(m => m.role === 'system')
      const chatMessages = messages.filter(m => m.role !== 'system')

      const body = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
      }
      if (systemMsg) body.system = systemMsg.content

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`LLM call failed (provider: anthropic, model: ${model}): ${res.status} ${errBody}`)
      }

      const data = await res.json()
      const latencyMs = Date.now() - startMs
      const usage = {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      }
      const content = data.content?.[0]?.text ?? ''

      return { content, parsed: tryParseJson(content), model: data.model ?? model, usage, latencyMs, cost: estimateCost(model, usage) }
    },

    getInfo() { return { provider: 'anthropic', model } },
  }
}

// ── OpenAI Provider ──────────────────────────────────────────────────

function openaiProvider(model) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('API key not set: OPENAI_API_KEY')
  }

  return {
    async chat(messages, opts = {}) {
      const { maxTokens = 4096, temperature = 0 } = opts
      const startMs = Date.now()

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`LLM call failed (provider: openai, model: ${model}): ${res.status} ${errBody}`)
      }

      const data = await res.json()
      const latencyMs = Date.now() - startMs
      const usage = {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      }
      const content = data.choices?.[0]?.message?.content ?? ''

      return { content, parsed: tryParseJson(content), model: data.model ?? model, usage, latencyMs, cost: estimateCost(model, usage) }
    },

    getInfo() { return { provider: 'openai', model } },
  }
}

// ── Google Provider ──────────────────────────────────────────────────

function googleProvider(model) {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('API key not set: GOOGLE_API_KEY')
  }

  return {
    async chat(messages, opts = {}) {
      const { maxTokens = 4096, temperature = 0 } = opts
      const startMs = Date.now()

      // Google: system role -> systemInstruction, only user/model messages in contents
      const systemMsg = messages.find(m => m.role === 'system')
      const chatMessages = messages.filter(m => m.role !== 'system')

      const body = {
        contents: chatMessages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: maxTokens, temperature },
      }
      if (systemMsg) {
        body.systemInstruction = { parts: [{ text: systemMsg.content }] }
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`LLM call failed (provider: google, model: ${model}): ${res.status} ${errBody}`)
      }

      const data = await res.json()
      const latencyMs = Date.now() - startMs
      const usage = {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
      }
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

      return { content, parsed: tryParseJson(content), model, usage, latencyMs, cost: estimateCost(model, usage) }
    },

    getInfo() { return { provider: 'google', model } },
  }
}

// ── Utilities ─────────────────────────────────────────────────────────

/**
 * Attempt JSON parse. Returns null on failure.
 * Also handles markdown code blocks (```json ... ```).
 */
function tryParseJson(text) {
  if (!text) return null
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

// ── Factory ──────────────────────────────────────────────────────────

/**
 * Creates an LLM client.
 *
 * @param {{ provider: 'anthropic'|'openai'|'google', model: string }} options
 */
export function createLlmClient({ provider, model }) {
  switch (provider) {
    case 'anthropic': return anthropicProvider(model)
    case 'openai': return openaiProvider(model)
    case 'google': return googleProvider(model)
    default: throw new Error(`Unsupported LLM provider: ${provider}`)
  }
}

/**
 * Creates verifier client array (Round 1 workers).
 *
 * Generated based on cross_verification.verifiers array in config.yaml.
 * Uses defaults (Claude Sonnet, all agents) if no verifiers specified.
 *
 * @param {object} [crossVerConfig] - cross_verification config block
 * @returns {{ id: string, agents: string[], client: object }[]}
 */
export function createVerifierClients(crossVerConfig) {
  const verifiers = crossVerConfig?.verifiers ?? [
    {
      id: 'claude-worker',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      agents: ['structure', 'convention', 'domain'],
    },
  ]

  return verifiers.map(v => ({
    id: v.id,
    agents: v.agents ?? ['structure', 'convention', 'domain'],
    client: createLlmClient({ provider: v.provider, model: v.model }),
  }))
}

/**
 * Creates judge client (Round 3 final verdict).
 *
 * Generated based on cross_verification.judge in config.yaml.
 * Automatically falls back to fallback_model if OPENAI_API_KEY is not set.
 *
 * @param {object} [crossVerConfig] - cross_verification config block
 * @param {string} [releaseMode] - NORMAL | SAFE | EMERGENCY
 * @returns {{ chat: Function, getInfo: Function, degraded: boolean }}
 */
export function createJudgeClient(crossVerConfig, releaseMode) {
  const judgeConf = crossVerConfig?.judge ?? {}
  const primaryProvider = judgeConf.provider ?? 'openai'
  const primaryModel = judgeConf.model ?? 'gpt-4o'
  const fallbackProvider = judgeConf.fallback_provider ?? 'anthropic'
  const fallbackModel = judgeConf.fallback_model ?? 'claude-opus-4-6'

  // SAFE mode: upgrade judge model to a more powerful model
  const effectiveModel = releaseMode === 'SAFE' && judgeConf.safe_model
    ? judgeConf.safe_model
    : primaryModel

  try {
    const client = createLlmClient({ provider: primaryProvider, model: effectiveModel })
    return { ...client, degraded: false }
  } catch {
    console.warn(
      `⚠️  ${primaryProvider.toUpperCase()}_API_KEY not set. ` +
      `Using ${fallbackModel} as judge (degraded cross-model verification).`
    )
    const client = createLlmClient({ provider: fallbackProvider, model: fallbackModel })
    return { ...client, degraded: true }
  }
}

/**
 * @deprecated Use createVerifierClients / createJudgeClient instead.
 * Kept for backward compatibility.
 */
export function createWorkerClient(crossVerConfig) {
  const verifiers = createVerifierClients(crossVerConfig)
  return verifiers[0].client
}

/**
 * @deprecated Use createJudgeClient instead.
 * Kept for backward compatibility.
 */
export function createLeaderClient(crossVerConfig) {
  return createJudgeClient(crossVerConfig)
}

export { tryParseJson, estimateCost }
