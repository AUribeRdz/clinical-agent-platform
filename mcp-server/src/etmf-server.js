/**
 * Medable eTMF MCP Server
 *
 * Exposes three tools to Claude Desktop:
 *   fetch_document   — retrieve a TMF document by study ID and version
 *   get_metadata     — get document metadata (status, approver, dates)
 *   list_documents   — list all documents for a study
 *
 * To wire to Claude Desktop:
 *   1. npm install  (in this directory)
 *   2. Add to ~/.config/claude/claude_desktop_config.json:
 *
 *      {
 *        "mcpServers": {
 *          "clinical-etmf": {
 *            "command": "node",
 *            "args": ["/absolute/path/to/mcp-server/src/etmf-server.js"]
 *          }
 *        }
 *      }
 *
 *   3. Restart Claude Desktop
 *   4. Test prompt: "Retrieve the protocol document for study ABC-001"
 *   5. Open Settings → Developer to see MCP tool calls in the inspector
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

// ── Mock eTMF data fixture ────────────────────────────────────────────────────
// In a real deployment this would call the eTMF REST API with OAuth2 auth.
// For the demo we use a local fixture so no real credentials are needed.

const documents = [
  {
    doc_id:      'tmf_001',
    study_id:    'ABC-001',
    version:     2,
    title:       'Clinical Study Protocol v2.1',
    doc_type:    'protocol',
    status:      'approved',
    approved_by: 'Dr. Sarah Chen',
    approved_at: '2026-04-15T10:30:00Z',
    pages:       84,
    content_summary: 'Phase III randomized controlled trial. Primary endpoint: reduction in AE rate at 12 weeks. Eligibility: adults 18-65 with confirmed diagnosis.',
  },
  {
    doc_id:      'tmf_002',
    study_id:    'ABC-001',
    version:     1,
    title:       'Informed Consent Form v1.0',
    doc_type:    'icf',
    status:      'approved',
    approved_by: 'IRB Committee',
    approved_at: '2026-03-01T09:00:00Z',
    pages:       12,
    content_summary: 'Informed consent document outlining study risks, benefits, and participant rights.',
  },
  {
    doc_id:      'tmf_003',
    study_id:    'XYZ-002',
    version:     1,
    title:       'Site Qualification Visit Report',
    doc_type:    'monitoring_report',
    status:      'pending_review',
    approved_by: null,
    approved_at: null,
    pages:       8,
    content_summary: 'Site qualification visit conducted 2026-05-10. Two minor findings noted. Follow-up required within 14 days.',
  },
]

// ── Tool definitions ──────────────────────────────────────────────────────────

const tools = [
  {
    name: 'fetch_document',
    description: 'Retrieve a Trial Master File (TMF) document by study ID and version number.',
    inputSchema: {
      type: 'object',
      properties: {
        study_id: { type: 'string', description: 'The study identifier, e.g. ABC-001' },
        version:  { type: 'number', description: 'Document version number. Omit to get latest.' },
      },
      required: ['study_id'],
    },
  },
  {
    name: 'get_metadata',
    description: 'Get approval status, approver, and dates for a specific TMF document.',
    inputSchema: {
      type: 'object',
      properties: {
        doc_id: { type: 'string', description: 'The document ID returned by fetch_document or list_documents' },
      },
      required: ['doc_id'],
    },
  },
  {
    name: 'list_documents',
    description: 'List all TMF documents available for a given study.',
    inputSchema: {
      type: 'object',
      properties: {
        study_id: { type: 'string', description: 'The study identifier' },
      },
      required: ['study_id'],
    },
  },
]

// ── Tool handlers ─────────────────────────────────────────────────────────────

function handleFetchDocument(args) {
  const { study_id, version } = args
  const matches = documents.filter(d => d.study_id === study_id)

  if (matches.length === 0) {
    return { error: `No documents found for study ${study_id}` }
  }

  const doc = version
    ? matches.find(d => d.version === version)
    : matches.reduce((a, b) => a.version > b.version ? a : b)

  if (!doc) {
    return { error: `No document found for study ${study_id} version ${version}` }
  }

  return {
    doc_id:          doc.doc_id,
    study_id:        doc.study_id,
    version:         doc.version,
    title:           doc.title,
    doc_type:        doc.doc_type,
    status:          doc.status,
    pages:           doc.pages,
    content_summary: doc.content_summary,
  }
}

function handleGetMetadata(args) {
  const doc = documents.find(d => d.doc_id === args.doc_id)
  if (!doc) return { error: `Document ${args.doc_id} not found` }

  return {
    doc_id:      doc.doc_id,
    title:       doc.title,
    status:      doc.status,
    approved_by: doc.approved_by ?? 'pending',
    approved_at: doc.approved_at ?? null,
    version:     doc.version,
    pages:       doc.pages,
  }
}

function handleListDocuments(args) {
  const matches = documents.filter(d => d.study_id === args.study_id)
  if (matches.length === 0) return { error: `No documents for study ${args.study_id}` }

  return {
    study_id: args.study_id,
    count: matches.length,
    documents: matches.map(d => ({
      doc_id:   d.doc_id,
      title:    d.title,
      version:  d.version,
      status:   d.status,
      doc_type: d.doc_type,
    })),
  }
}

// ── Server setup ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'clinical-etmf', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  let result
  switch (name) {
    case 'fetch_document':   result = handleFetchDocument(args);  break
    case 'get_metadata':     result = handleGetMetadata(args);    break
    case 'list_documents':   result = handleListDocuments(args);  break
    default:
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }] }
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
})

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('Medable eTMF MCP server running on stdio — ready for Claude Desktop')
