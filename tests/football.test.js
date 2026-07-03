import { test } from "node:test";
import assert from "node:assert/strict";
import { footballData } from "@punt/juror/football.js";

const finished = {
  matches: [
    {
      utcDate: "2026-07-05T19:00:00Z",
      status: "FINISHED",
      homeTeam: { name: "France" },
      awayTeam: { name: "Brazil" },
      score: { winner: "HOME_TEAM", fullTime: { home: 2, away: 1 } },
    },
    {
      utcDate: "2026-07-05T16:00:00Z",
      status: "FINISHED",
      homeTeam: { name: "Arsenal FC" },
      awayTeam: { name: "Chelsea FC" },
      score: { winner: "AWAY_TEAM", fullTime: { home: 0, away: 3 } },
    },
  ],
};

function fakeFetch(payload, capture = {}) {
  return async (url, opts) => {
    capture.url = url;
    capture.headers = opts.headers;
    return { ok: true, json: async () => payload };
  };
}

test("finds a finished match by team names around the kickoff date", async () => {
  const capture = {};
  const fd = footballData("KEY123", fakeFetch(finished, capture));
  const m = await fd.findFinished("France", "Brazil", "2026-07-05T19:00:00Z");
  assert.equal(m.fullTime.home, 2);
  assert.equal(m.winner, "HOME_TEAM");
  assert.match(capture.url, /dateFrom=2026-07-04/);
  assert.match(capture.url, /dateTo=2026-07-06/);
  assert.equal(capture.headers["X-Auth-Token"], "KEY123");
});

test("matches club names loosely (Arsenal → Arsenal FC), either field order", async () => {
  const fd = footballData("K", fakeFetch(finished));
  const m = await fd.findFinished("chelsea", "arsenal", "2026-07-05T12:00:00Z");
  assert.equal(m.fullTime.away, 3);
});

test("returns null when no finished match fits", async () => {
  const fd = footballData("K", fakeFetch(finished));
  assert.equal(await fd.findFinished("Spain", "Italy", "2026-07-05T12:00:00Z"), null);
});
