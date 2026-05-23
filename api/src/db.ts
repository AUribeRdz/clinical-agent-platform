import { Pool } from 'pg'

// Single shared connection pool for the entire API process.
// pg-pool manages connection lifecycle, retries, and idle timeouts automatically.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,               // maximum concurrent connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err)
})
