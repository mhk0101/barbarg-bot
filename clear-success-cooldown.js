// Deletes the "success cooldown" (account+plate) rows so you can test again.
// Only touches the database. Does NOT run the bot.
// Usage: node clear-success-cooldown.js
require('dotenv').config()
const { Client } = require('pg')

const url = (process.env.DATABASE_URL || '').trim()
if (!url) {
  console.error('ERROR: DATABASE_URL is empty. .env not found or missing value.')
  process.exit(1)
}

// Strip query params (e.g. ?schema=public) so pg accepts the URL
let cleanUrl = url
try {
  const u = new URL(url)
  u.search = ''
  cleanUrl = u.toString()
} catch (e) {
  cleanUrl = url
}

const client = new Client({ connectionString: cleanUrl })

async function main() {
  await client.connect()
  console.log('Connected to database.')

  const before = await client.query(
    `SELECT count(*)::int AS n FROM "Setting" WHERE key LIKE 'automation.successCooldown.%'`
  )
  console.log('Rows before delete: ' + before.rows[0].n)

  const res = await client.query(
    `DELETE FROM "Setting" WHERE key LIKE 'automation.successCooldown.%'`
  )
  console.log('Deleted rows: ' + res.rowCount)

  if (res.rowCount === 0) {
    console.log('(No record found - already cleared, or nothing saved yet.)')
  }
  console.log('DONE. You can test again right now.')
}

main()
  .then(() => client.end())
  .catch((e) => {
    console.error('ERROR:', e.message)
    console.error('')
    console.error('If it is a connection error, check that .env exists next to')
    console.error('this file and DATABASE_URL inside it is correct.')
    client.end().catch(() => {})
    process.exit(1)
  })
