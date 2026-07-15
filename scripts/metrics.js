/**
 * Prometheus loopback metrics — exposes Punt-specific gauges and counters
 * on a loopback-only HTTP server so the peer's operational state is
 * observable without granting network access.
 *
 * Metrics:
 *   punt_peers_connected — DHT peer count (gauge)
 *   punt_bets_open — open bets visible to this peer (gauge)
 *   punt_verdicts_total — verdicts this juror has signed (counter)
 *   punt_jury_latency_seconds — grading duration (histogram)
 *   punt_llm_load_seconds — model load time (gauge)
 *   punt_gasless_stakes_total — gasless stake tx count (counter)
 *
 * Usage: import { startMetrics } from "./metrics.js"; const m = startMetrics(port);
 *        m.inc("verdicts"); m.observe("jury_latency", seconds);
 *        m.set("peers", n); // exposed at GET /metrics on 127.0.0.1:<port>
 */
import http from "node:http";

const GAUGE = "gauge";
const COUNTER = "counter";
const HISTOGRAM = "histogram";

/**
 * @param {number} [port=9090] — loopback-only listen port
 * @returns {{ inc, set, observe, close }}
 */
export function startMetrics(port = 9090) {
  const state = {
    punt_peers_connected: { type: GAUGE, value: 0 },
    punt_bets_open: { type: GAUGE, value: 0 },
    punt_verdicts_total: { type: COUNTER, value: 0 },
    punt_jury_latency_seconds: { type: HISTOGRAM, buckets: [1, 2, 5, 10, 30], values: [] },
    punt_llm_load_seconds: { type: GAUGE, value: 0 },
    punt_gasless_stakes_total: { type: COUNTER, value: 0 },
  };

  function renderMetrics() {
    const lines = [];
    for (const [name, metric] of Object.entries(state)) {
      lines.push(`# HELP ${name} Punt peer ${metric.type}`);
      lines.push(`# TYPE ${name} ${metric.type}`);
      if (metric.type === HISTOGRAM) {
        const sorted = [...metric.values].sort((a, b) => a - b);
        for (const v of sorted) lines.push(`${name}_bucket{le="+Inf"} ${sorted.length}`);
        let cum = 0;
        for (const b of metric.buckets) {
          cum += sorted.filter((v) => v <= b).length;
          lines.push(`${name}_bucket{le="${b}"} ${cum}`);
        }
        const sum = sorted.reduce((a, b) => a + b, 0);
        lines.push(`${name}_sum ${sum}`);
        lines.push(`${name}_count ${sorted.length}`);
      } else {
        lines.push(`${name} ${metric.value}`);
      }
    }
    return lines.join("\n") + "\n";
  }

  const server = http.createServer((req, res) => {
    if (req.url === "/metrics") {
      res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" });
      res.end(renderMetrics());
    } else if (req.url === "/health") {
      res.writeHead(200);
      res.end("ok");
    } else {
      res.writeHead(404);
      res.end("metrics: GET /metrics");
    }
  });

  server.listen(port, "127.0.0.1");

  return {
    inc(name, n = 1) {
      if (state[name]) state[name].value += n;
    },
    set(name, value) {
      if (state[name]) state[name].value = value;
    },
    observe(name, value) {
      if (state[name]?.type === HISTOGRAM) state[name].values.push(value);
    },
    close() {
      server.close();
    },
  };
}
