import os from "node:os";

// Rolling request counter behind GET /metrics. Buckets are per-minute so the
// hourly figure is a true trailing window rather than a counter that resets on
// deploy — a per-app table on admin.3pandalabs.com compares apps, and a
// deploy-reset counter would make a freshly deployed app look idle.
const WINDOW_MINUTES = 60;
const buckets = new Map<number, number>();

function currentMinute(): number {
  return Math.floor(Date.now() / 60_000);
}

export function recordRequest(): void {
  const m = currentMinute();
  buckets.set(m, (buckets.get(m) ?? 0) + 1);
  const cutoff = m - WINDOW_MINUTES;
  for (const k of buckets.keys()) {
    if (k < cutoff) buckets.delete(k);
  }
}

export function requestsLastHour(): number {
  const cutoff = currentMinute() - WINDOW_MINUTES;
  let total = 0;
  for (const [k, v] of buckets) {
    if (k >= cutoff) total += v;
  }
  return total;
}

// process.cpuUsage() is cumulative, so a single reading says nothing about
// current load. Sample the delta on an interval and report that instead.
let lastCpu = process.cpuUsage();
let lastSampleAt = Date.now();
let cpuPercent = 0;

export function startCpuSampler(intervalMs = 15_000): NodeJS.Timeout {
  const t = setInterval(() => {
    const now = Date.now();
    const usage = process.cpuUsage(lastCpu);
    const elapsedMicros = (now - lastSampleAt) * 1000;
    const used = usage.user + usage.system;
    cpuPercent = elapsedMicros > 0 ? Math.min(100, (used / elapsedMicros) * 100) : 0;
    lastCpu = process.cpuUsage();
    lastSampleAt = now;
  }, intervalMs);
  // Don't hold the event loop open on shutdown.
  t.unref();
  return t;
}

export function snapshot() {
  const mem = process.memoryUsage();
  return {
    app: "evitevault",
    uptimeSeconds: Math.round(process.uptime()),
    requestsLastHour: requestsLastHour(),
    cpuPercent: Number(cpuPercent.toFixed(1)),
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    loadAverage: os.loadavg().map((n) => Number(n.toFixed(2))),
    nodeVersion: process.version,
  };
}
