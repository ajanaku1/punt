/**
 * football-data.org client — the jury's shared source of official results.
 * One disclosed remote service; free tier covers World Cup 2026.
 */
const BASE = "https://api.football-data.org/v4";

const day = (iso, offset) => {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const namesMatch = (betName, apiName) => {
  const a = betName.toLowerCase().trim();
  const b = apiName.toLowerCase().trim();
  return a.includes(b) || b.includes(a);
};

export function footballData(apiKey, fetchImpl = fetch, base = BASE) {
  return {
    /** Finished match for (home, away) within ±1 day of kickoff, or null. */
    async findFinished(home, away, kickoffIso) {
      const url = `${base}/matches?status=FINISHED&dateFrom=${day(kickoffIso, -1)}&dateTo=${day(kickoffIso, 1)}`;
      const res = await fetchImpl(url, { headers: { "X-Auth-Token": apiKey } });
      if (!res.ok) throw new Error(`football-data ${res.status}`);
      const { matches = [] } = await res.json();
      const hit = matches.find(
        (m) =>
          m.status === "FINISHED" &&
          ((namesMatch(home, m.homeTeam.name) && namesMatch(away, m.awayTeam.name)) ||
            (namesMatch(home, m.awayTeam.name) && namesMatch(away, m.homeTeam.name))),
      );
      if (!hit) return null;
      return {
        status: hit.status,
        utcDate: hit.utcDate,
        homeTeam: hit.homeTeam.name,
        awayTeam: hit.awayTeam.name,
        fullTime: hit.score.fullTime,
        winner: hit.score.winner,
      };
    },
  };
}
