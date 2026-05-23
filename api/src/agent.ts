import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// The prompt version hash is the git commit hash of the prompt file.
// In demo mode we compute it from the file content instead.
const PROMPT_PATH = path.join(__dirname, '../../prompts/v1.2.3/ae_extractor.txt')

function loadPrompt(): { text: string; hash: string } {
  try {
    const text = fs.readFileSync(PROMPT_PATH, 'utf-8')
    const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
    return { text, hash }
  } catch {
    // Fallback if running outside Docker and the prompts folder is not mounted
    const fallback = `ROLE: You are a clinical adverse event extraction agent.
TASK: Extract adverse event information from the provided clinical note.
OUTPUT: Respond ONLY as valid JSON with these fields: ae_term, severity, onset_date, confidence, field_type, status.
UNCERTAINTY: If confidence is below 0.85, set status to "requires_review". Never guess.
PROHIBITED: Do not infer, extrapolate, or fabricate any field value.`
    return { text: fallback, hash: 'fallback-prompt' }
  }
}

export interface AgentOutput {
  ae_term:        string | null
  severity:       string | null
  onset_date:     string | null
  confidence:     number
  field_type:     string
  status:         'approved' | 'requires_review'
  reason?:        string
  prompt_version: string
}

export async function runAgent(note: string, fieldType: string): Promise<AgentOutput> {
  const { text: systemPrompt, hash: promptVersion } = loadPrompt()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: note }],
  })

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  // Strip any markdown fences the model might add
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    return {
      ae_term:        parsed.ae_term        ?? null,
      severity:       parsed.severity       ?? null,
      onset_date:     parsed.onset_date     ?? null,
      confidence:     Number(parsed.confidence ?? 0),
      field_type:     parsed.field_type     ?? fieldType,
      status:         parsed.status         ?? 'requires_review',
      reason:         parsed.reason,
      prompt_version: promptVersion,
    }
  } catch {
    // If the model failed to produce valid JSON, treat as low-confidence
    return {
      ae_term:        null,
      severity:       null,
      onset_date:     null,
      confidence:     0,
      field_type:     fieldType,
      status:         'requires_review',
      reason:         'Model did not return valid JSON — raw output: ' + raw.slice(0, 200),
      prompt_version: promptVersion,
    }
  }
}
