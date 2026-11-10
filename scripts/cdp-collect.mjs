// Temporary CDP console/network collector for the phone's open tab.
// Connects to the DevTools page websocket, enables Runtime/Log/Console/Network,
// and prints events for a fixed window so we can diagnose the chess room.
const WS_URL = process.argv[2];
const DURATION_MS = Number(process.argv[3] || 15000);

if (!WS_URL) {
  console.error('usage: node cdp-collect.mjs <ws-url> [durationMs]');
  process.exit(1);
}

const ws = new WebSocket(WS_URL);
let id = 0;
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));

ws.addEventListener('open', () => {
  send('Runtime.enable');
  send('Log.enable');
  send('Console.enable');
  send('Network.enable');
  send('Runtime.consoleAPICalled');
  console.log('[cdp] connected, collecting for', DURATION_MS, 'ms');
});

function fmtArg(a) {
  if (a == null) return String(a);
  if (a.value !== undefined) return typeof a.value === 'object' ? JSON.stringify(a.value) : String(a.value);
  if (a.description) return a.description;
  if (a.unserializableValue) return a.unserializableValue;
  return a.type || '?';
}

ws.addEventListener('message', (ev) => {
  let msg;
  try { msg = JSON.parse(ev.data); } catch { return; }
  const { method, params } = msg;
  if (!method) return;

  if (method === 'Runtime.consoleAPICalled') {
    const text = (params.args || []).map(fmtArg).join(' ');
    console.log(`[console.${params.type}] ${text}`);
  } else if (method === 'Runtime.exceptionThrown') {
    const d = params.exceptionDetails;
    console.log(`[exception] ${d.exception?.description || d.text}`);
  } else if (method === 'Log.entryAdded') {
    const e = params.entry;
    console.log(`[log.${e.level}] ${e.text}${e.url ? ' @ ' + e.url : ''}`);
  } else if (method === 'Network.responseReceived') {
    const r = params.response;
    if (r.status >= 400) console.log(`[net ${r.status}] ${r.url}`);
  } else if (method === 'Network.loadingFailed') {
    console.log(`[net FAIL] ${params.errorText} ${params.type}`);
  }
});

ws.addEventListener('error', (e) => console.error('[cdp] ws error', e.message || e));

setTimeout(() => {
  console.log('[cdp] done');
  ws.close();
  process.exit(0);
}, DURATION_MS);
