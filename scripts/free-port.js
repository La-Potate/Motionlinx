#!/usr/bin/env node
'use strict';

/**
 * Free the dev port before starting, so `npm run dev` is always a clean start.
 *
 * A previous run that was killed with the window rather than Ctrl+C leaves a
 * node process holding the port. The next start then fails with EADDRINUSE,
 * the bind guard in src/app.js exits non-zero, and nodemon parks on
 * "app crashed - waiting for file changes before starting".
 *
 * This only ever kills a process that is BOTH listening on the target port AND
 * running this repo's own entry point. Anything else — another project on the
 * same port, a database, an editor — is reported and left alone. Killing by
 * port number alone would be far too blunt.
 */

const { execSync } = require('child_process');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const REPO = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

const sh = (cmd) => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
};

/** PIDs listening on PORT. */
function listeningPids() {
  const pids = new Set();
  if (isWindows) {
    for (const line of sh(`netstat -ano -p TCP`).split('\n')) {
      const m = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i);
      if (m && Number(m[1]) === PORT) pids.add(m[2]);
    }
  } else {
    for (const pid of sh(`lsof -ti tcp:${PORT} -sTCP:LISTEN`).split('\n')) {
      if (pid.trim()) pids.add(pid.trim());
    }
  }
  return [...pids];
}

/** Full command line for a pid, for the ownership check below. */
function commandLine(pid) {
  if (isWindows) {
    const out = sh(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
    );
    return out.trim();
  }
  return sh(`ps -p ${pid} -o command=`).trim();
}

function kill(pid) {
  if (isWindows) sh(`taskkill /PID ${pid} /F /T`);
  else sh(`kill -9 ${pid}`);
}

const pids = listeningPids();
if (pids.length === 0) {
  process.exit(0);
}

for (const pid of pids) {
  if (String(pid) === String(process.pid)) continue;
  const cmd = commandLine(pid);
  const normalised = cmd.replace(/\\/g, '/');
  const ours =
    /node(\.exe)?["']?\s/i.test(cmd) &&
    (normalised.includes('src/index.js') || normalised.includes(REPO.replace(/\\/g, '/')));

  if (ours) {
    // eslint-disable-next-line no-console
    console.log(`[dev] Port ${PORT} held by a stale instance (pid ${pid}) — stopping it.`);
    kill(pid);
  } else {
    // eslint-disable-next-line no-console
    console.error(
      `[dev] Port ${PORT} is in use by a process that is NOT this app (pid ${pid}):\n` +
        `      ${cmd || '(command line unavailable)'}\n` +
        `      Leaving it alone. Stop it yourself, or start on another port:  PORT=3002 npm run dev`,
    );
    process.exit(1);
  }
}

// Sockets take a moment to release after the process dies.
const until = Date.now() + 3000;
while (listeningPids().length > 0 && Date.now() < until) {
  // Busy-wait deliberately: this is a short pre-start script with no event
  // loop work to do, and blocking here keeps `npm run dev` sequential.
  execSync(isWindows ? 'ping -n 2 127.0.0.1 > NUL' : 'sleep 0.3', { stdio: 'ignore' });
}
