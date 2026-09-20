import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Versioned prompts live in GxP_prompts/<version>/ae_extractor.txt.
//   PROMPT_VERSION  which version to load (default: current production version)
//   PROMPTS_DIR     where the GxP_prompts folder is (docker-compose mounts it into the container)
// The value stored with every run is "<version>:<first 16 hex of SHA-256 of the file content>",
// so an auditor can tell both which version ran and that the file was not edited in place.
const PROMPTS_DIR = process.env.PROMPTS_DIR ?? path.join(__dirname, '../../GxP_prompts')
const PROMPT_VERSION = process.env.PROMPT_VERSION ?? 'v1.2.4'
const PROMPT_PATH = path.join(PROMPTS_DIR, PROMPT_VERSION, 'ae_extractor.txt')

let cachedPrompt: { text: string; hash: string } | null = null

function loadPrompt(): { text: string; hash: string } {
  if (cachedPrompt) return cachedPrompt
  let text: string
  try {
    text = fs.readFileSync(PROMPT_PATH, 'utf-8')
  } catch {
    // Fail closed: in a GxP setting an unversioned prompt must never be used silently.
    throw new Error(
      `Prompt file not found or unreadable: ${PROMPT_PATH}. ` +
      `Set PROMPTS_DIR / PROMPT_VERSION, or mount the GxP_prompts folder.`
    )
  }
  // Normalize line endings so the hash (and the prompt the model receives) are identical
  // whether the file was checked out with LF (Linux, macOS) or CRLF (Windows autocrlf).
  text = text.replace(/\r\n/g, '\n')
  const sha = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
  cachedPrompt = { text, hash: `${PROMPT_VERSION}:${sha}` }
  return cachedPrompt
}

/** Call once at startup so a missing prompt stops the API instead of failing on the first request. */
export function initPrompt(): { version: string; hash: string } {
  const { hash } = loadPrompt()
  return { version: PROMPT_VERSION, hash }
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

  // An empty or whitespace-only note has nothing to extract, and the API rejects empty
  // messages. Fail safe: send it to human review without calling the model.
  if (!note || !note.trim()) {
    return {
      ae_term:        null,
      severity:       null,
      onset_date:     null,
      confidence:     0,
      field_type:     fieldType,
      status:         'requires_review',
      reason:         'Empty clinical note - nothing to extract.',
      prompt_version: promptVersion,
    }
  }

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
