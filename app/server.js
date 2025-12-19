const express = require('express');
const os = require('os');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const app = express();
const port = process.env.PORT || 80;

// Helpful metadata for demo
const APP_VERSION = process.env.APP_VERSION || 'local';
const GIT_SHA = process.env.GIT_SHA || 'unknown';
const FEATURE_NEW_UI = (process.env.FEATURE_NEW_UI || 'false').toLowerCase() === 'true';

app.get('/', (req, res) => {
  res.type('text/plain').send(
    [
      'ECS + RDS + GitHub Actions Demo',
      `hostname=${os.hostname()}`,
      `version=${APP_VERSION}`,
      `git_sha=${GIT_SHA}`,
      `feature_new_ui=${FEATURE_NEW_UI}`,
      '',
      'Endpoints:',
      '  /health   -> health check',
      '  /version  -> build metadata',
      '  /feature  -> feature flag demo',
      '  /db       -> DB connectivity check (requires env vars)',
    ].join('\n')
  );
});

app.get('/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.get('/version', (req, res) => {
  res.json({
    app_version: APP_VERSION,
    git_sha: GIT_SHA,
    hostname: os.hostname(),
    node: process.version,
    ts: new Date().toISOString()
  });
});

app.get('/feature', (req, res) => {
  res.json({
    feature_new_ui: FEATURE_NEW_UI,
    message: FEATURE_NEW_UI ? "New UI enabled (feature flag ON)" : "New UI disabled (feature flag OFF)"
  });
});

// Optional DB check: MySQL-compatible (Aurora MySQL, RDS MySQL)
// Required env vars: DB_HOST, DB_PORT (optional), DB_USER, DB_PASSWORD, DB_NAME
app.get('/db', async (req, res) => {
  const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    return res.status(400).json({
      ok: false,
      error: "Missing DB env vars. Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (and optionally DB_PORT)."
    });
  }

  let conn;
  try {
    conn = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
      connectTimeout: 5000
    });

    const [rows] = await conn.query('SELECT NOW() AS now, @@version AS version');
    res.json({ ok: true, db: rows && rows[0] ? rows[0] : rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    try { if (conn) await conn.end(); } catch (_) {}
  }
});

// Keep container-friendly behavior
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
