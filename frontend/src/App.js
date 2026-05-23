import { useState, useEffect, useCallback } from 'react'

const API = process.env.REACT_APP_API_URL ?? 'http://localhost:4000'
const TOKEN = process.env.REACT_APP_DEMO_TOKEN ?? 'demo-token'

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
}

// ── Confidence badge — color changes based on threshold proximity ─────────────
function ConfidenceBadge({ value, threshold }) {
  const pct = Math.round(value * 100)
  const isLow = value < threshold
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 12px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 600,
    background: isLow ? '#FAECE7' : '#E1F5EE',
    color: isLow ? '#712B13' : '#085041',
    border: `1px solid ${isLow ? '#F5C4B3' : '#9FE1CB'}`,
  }
  return (
    <span style={style}>
      {isLow ? '⚠ ' : '✓ '}{pct}% confidence
      {isLow && <span style={{ fontWeight: 400, fontSize: 11 }}> — below {Math.round(threshold * 100)}% threshold</span>}
    </span>
  )
}

// ── Single queue item card ─────────────────────────────────────────────────────
function QueueItem({ item, onDecision }) {
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const output = item.output_json ?? {}
  const threshold = 0.92  // adverse_event default — real app reads from API

  async function decide(decision) {
    if (decision === 'rejected' && !notes.trim()) {
      setError('Notes are required when rejecting.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`${API}/hitl/${item.id}/decide`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ decision, notes, reviewer_id: 'demo-reviewer' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Request failed')
      }
      onDecision(item.id, decision)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const card = {
    background: '#fff',
    border: '0.5px solid #D3D1C7',
    borderRadius: 12,
    padding: '20px 24px',
    marginBottom: 16,
  }
  const row = { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }
  const label = { fontSize: 12, color: '#5F5E5A', minWidth: 110 }
  const value = { fontSize: 14, color: '#2C2C2A' }

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888780', marginBottom: 4 }}>
            Awaiting review
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#2C2C2A' }}>
            Subject: {item.subject_id}
          </div>
          <div style={{ fontSize: 12, color: '#888780', marginTop: 2 }}>
            Run ID: {item.id.slice(0, 8)}… · {new Date(item.run_at).toLocaleString()}
          </div>
        </div>
        <ConfidenceBadge value={item.confidence} threshold={threshold} />
      </div>

      {/* Source note */}
      <div style={{ background: '#F1EFE8', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#444441', lineHeight: 1.6 }}>
        <span style={{ fontWeight: 500, display: 'block', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888780' }}>Source note</span>
        {item.source_data?.note ?? 'No source note available'}
      </div>

      {/* Agent output */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888780', marginBottom: 8 }}>
          Agent output
        </div>
        <div style={row}><span style={label}>AE term</span><span style={value}>{output.ae_term ?? <em style={{color:'#888780'}}>not extracted</em>}</span></div>
        <div style={row}><span style={label}>Severity</span><span style={value}>{output.severity ?? <em style={{color:'#888780'}}>not extracted</em>}</span></div>
        <div style={row}><span style={label}>Onset date</span><span style={value}>{output.onset_date ?? <em style={{color:'#888780'}}>not extracted</em>}</span></div>
        {output.reason && (
          <div style={{ fontSize: 12, color: '#712B13', background: '#FAECE7', borderRadius: 6, padding: '6px 10px', marginTop: 6 }}>
            Agent note: {output.reason}
          </div>
        )}
      </div>

      {/* Reviewer notes */}
      <textarea
        placeholder="Reviewer notes — required when rejecting"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '8px 12px', fontSize: 13, borderRadius: 8,
          border: '0.5px solid #D3D1C7', marginBottom: 10, resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />
      {error && <div style={{ color: '#712B13', fontSize: 12, marginBottom: 8 }}>{error}</div>}

      {/* Decision buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => decide('approved')}
          disabled={submitting}
          style={{
            padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            cursor: submitting ? 'not-allowed' : 'pointer',
            background: '#E1F5EE', color: '#085041', border: '1px solid #9FE1CB',
          }}
        >
          {submitting ? 'Saving…' : '✓  Approve'}
        </button>
        <button
          onClick={() => decide('rejected')}
          disabled={submitting}
          style={{
            padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            cursor: submitting ? 'not-allowed' : 'pointer',
            background: '#FAECE7', color: '#712B13', border: '1px solid #F5C4B3',
          }}
        >
          {submitting ? 'Saving…' : '✗  Reject'}
        </button>
      </div>
    </div>
  )
}

// ── Main app ──────────────────────────────────────────────────────────────────
export default function App() {
  const [queue, setQueue] = useState([])
  const [decided, setDecided] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch(`${API}/hitl/queue`, { headers })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = await res.json()
      setQueue(data.queue)
      setError('')
    } catch (err) {
      setError('Could not reach API — is docker-compose up running?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  function handleDecision(runId, decision) {
    setQueue(q => q.filter(item => item.id !== runId))
    setDecided(d => [{ runId, decision, at: new Date().toISOString() }, ...d])
  }

  const shell = { maxWidth: 720, margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui, sans-serif' }

  return (
    <div style={shell}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: 6 }}>
          Agent Studio — HITL Reviewer
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: '#2C2C2A', margin: 0 }}>
          Review queue
        </h1>
        <p style={{ fontSize: 14, color: '#5F5E5A', marginTop: 6, lineHeight: 1.6 }}>
          Agent outputs below the confidence threshold require human review before proceeding.
          Every decision is logged immutably to the audit trail.
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Awaiting review', value: queue.length, color: '#185FA5' },
          { label: 'Decided this session', value: decided.length, color: '#085041' },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: '#F1EFE8', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: '#5F5E5A', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 500, color: s.color }}>{s.value}</div>
          </div>
        ))}
        <button
          onClick={fetchQueue}
          style={{ padding: '0 20px', borderRadius: 8, fontSize: 13, cursor: 'pointer', border: '0.5px solid #D3D1C7', background: '#fff', color: '#2C2C2A' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Queue */}
      {loading && <div style={{ color: '#888780', fontSize: 14 }}>Loading queue…</div>}
      {error && <div style={{ color: '#712B13', background: '#FAECE7', borderRadius: 8, padding: '12px 16px', fontSize: 14 }}>{error}</div>}
      {!loading && !error && queue.length === 0 && decided.length === 0 && (
        <div style={{ color: '#888780', fontSize: 14, padding: '24px 0' }}>
          No items awaiting review. The agent's confidence is above threshold on all recent runs.
        </div>
      )}
      {queue.map(item => (
        <QueueItem key={item.id} item={item} onDecision={handleDecision} />
      ))}

      {/* Decided this session */}
      {decided.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888780', marginBottom: 10 }}>
            Decided this session
          </div>
          {decided.map(d => (
            <div key={d.runId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '0.5px solid #F1EFE8', color: '#5F5E5A' }}>
              <span>Run {d.runId.slice(0, 8)}…</span>
              <span style={{ color: d.decision === 'approved' ? '#085041' : '#712B13', fontWeight: 500 }}>
                {d.decision === 'approved' ? '✓ Approved' : '✗ Rejected'}
              </span>
              <span>{new Date(d.at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
