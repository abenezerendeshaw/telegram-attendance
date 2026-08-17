import fs from 'fs';
import path from 'path';
import axios from 'axios';

// Patch axios.post to avoid sending real Telegram messages during tests
axios.post = async (...args) => {
  console.log('[test] axios.post called with', args[0]);
  return { data: {} };
};

// Load .env.local into process.env (simple parser)
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const eq = l.indexOf('=');
    if (eq === -1) continue;
    let key = l.slice(0, eq).trim();
    let val = l.slice(eq + 1).trim();
    // Remove surrounding quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
  console.log('[test] Loaded .env.local into process.env');
} else {
  console.warn('[test] .env.local not found');
}

// Import handlers
import initHandler from '../api/init.js';
import submitHandler from '../api/submit.js';

function makeMockRes() {
  const out = { statusCode: 200, body: null };
  return {
    status(code) { out.statusCode = code; return this; },
    json(obj) { out.body = obj; console.log('[test] res.json:', codeOr(obj, out)); return out; },
    send(obj) { out.body = obj; console.log('[test] res.send:', obj); return out; },
    _out: out,
  };
}

function codeOr(obj, out){ return obj; }

(async () => {
  console.log('[test] Starting init test');
  const initReq = { method: 'POST', body: {} };
  const initRes = makeMockRes();
  try {
    const r = await initHandler(initReq, initRes);
    console.log('[test] init handler returned', r || initRes._out);
  } catch (e) {
    console.error('[test] init handler error', e);
  }

  console.log('[test] Starting submit test');
  // pick a student from students.js — use a common name
  const sample = {
    method: 'POST',
    body: {
      fullName: 'ኢየሱሩሳሌም ንጉሴ',
      group: 'ቡድን 1: ቤተ አውታር',
      status: 'present',
      latitude: '9.022747882194494',
      longitude: '38.84117275885996'
    }
  };
  const submitRes = makeMockRes();
  try {
    const r2 = await submitHandler(sample, submitRes);
    console.log('[test] submit handler returned', r2 || submitRes._out);
  } catch (e) {
    console.error('[test] submit handler error', e);
  }
})();
