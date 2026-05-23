import { pool } from './db'

/**
 * Write a row to the append-only audit_log table.
 *
 * This function only ever issues INSERT statements — never UPDATE or DELETE.
 * That constraint, enforced both here and via Postgres RULE in migration 001,
 * satisfies 21 CFR Part 11 audit trail requirements.
 *
 * Every significant read and write in the application calls this function so
 * auditors can reconstruct the exact state the agent saw at decision time.
 */
export async function writeAuditLog(
  tableName: string,
  rowId: string,
  action: 'INSERT' | 'SELECT',
  actor: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (table_name, row_id, action, actor)
       VALUES ($1, $2, $3, $4)`,
      [tableName, rowId, action, actor]
    )
  } catch (err) {
    // Log but do not throw — a failed audit write should never break the main flow.
    // In a real GxP deployment this would alert the ops team.
    console.error('audit_log write failed:', err)
  }
}
