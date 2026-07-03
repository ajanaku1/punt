/* Renderer logic: poll the peer daemon, drive the swipe stack + composer. */
const API = new URLSearchParams(location.search).get("api") ?? "http://127.0.0.1:9701";

const $ = (id) => document.getElementById(id);
const state = { bets: [], me: null, dismissed: new Set(), busy: false, draft: null };

async function api(path, body) {
  const res = await fetch(API + path, body ? { method: "POST", body: JSON.stringify(body) } : undefined);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "request failed");
  return json;
}

function toast(msg, ms = 2600) {
  $("toast").textContent = msg;
  $("toast").style.display = "block";
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ($("toast").style.display = "none"), ms);
}

// ---- feed polling --------------------------------------------------------

async function refresh() {
  try {
    const snap = await api("/state");
    state.me = snap;
    $("usdt").textContent = snap.usdt.toFixed(2);
    const open = snap.bets.filter((b) => b.potStatus === "open").length;
    const model = snap.modelReady ? "AI READY" : `AI LOADING ${Math.round(snap.modelProgress)}%`;
    $("ticker").innerHTML = `LIVE FEED · <b>${open} OPEN</b> · ${snap.bets.length} TOTAL · <b>${model}</b> · NO BOOKIE · NO SERVER`;
    state.bets = snap.bets;
    renderStack();
  } catch {
    $("ticker").textContent = "PEER DAEMON UNREACHABLE — IS IT RUNNING?";
  }
}

function swipeable() {
  return state.bets.filter(
    (b) => !state.dismissed.has(b.betId) && !b.mine && b.potStatus === "open",
  );
}

// ---- card stack ----------------------------------------------------------

// every bet field came off the wire from a peer — escape before it touches innerHTML
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function cardHtml(bet, matched) {
  const kick = new Date(bet.match.kickoff);
  const when = kick.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const short = (t) => esc(t.length > 12 ? t.slice(0, 11) + "…" : t);
  return `
    <span class="comp-tag ${matched ? "matched" : ""}">${matched ? "MATCHED" : "OPEN BET"}</span>
    <div class="scoreline">
      <div class="team">${short(bet.match.home)}</div><div class="vs">VS</div><div class="team">${short(bet.match.away)}</div>
    </div>
    <div class="kick">${when} · ${bet.market.replace("_", "/").toUpperCase()}</div>
    <div class="claim">“<em>${esc(bet.selection)}.</em>”</div>
    <div class="odds-strip">
      <div class="chip"><div class="k">Stake each</div><div class="v lime">${bet.stake.toFixed(2)}</div></div>
      <div class="chip"><div class="k">Pot pays</div><div class="v">${(bet.stake * 2).toFixed(2)}</div></div>
      <div class="chip"><div class="k">Settles by</div><div class="v small">AI jury<br>3 peers</div></div>
    </div>
    <div class="byline"><span>peer ${esc(bet.creator.slice(0, 8))}…</span><span>${new Date(bet.createdAt).toLocaleTimeString()}</span></div>
    <div class="verdict-stamp take">STAKED ✓</div>
    <div class="verdict-stamp pass">PASS</div>`;
}

function renderStack() {
  const stack = $("stack");
  stack.querySelectorAll(".card").forEach((el) => el.remove());
  const deck = swipeable();
  $("empty").style.display = deck.length ? "none" : "flex";
  // paint up to two: one behind, one on top
  if (deck[1]) {
    const behind = document.createElement("div");
    behind.className = "card behind";
    behind.innerHTML = cardHtml(deck[1], false);
    stack.appendChild(behind);
  }
  if (deck[0]) {
    const top = document.createElement("div");
    top.className = "card";
    top.innerHTML = cardHtml(deck[0], false);
    stack.appendChild(top);
    attachSwipe(top, deck[0]);
  }
}

function attachSwipe(el, bet) {
  let startX = 0, dx = 0, dragging = false;
  el.addEventListener("pointerdown", (e) => {
    if (state.busy) return;
    dragging = true; startX = e.clientX; el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    el.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
    const take = el.querySelector(".verdict-stamp.take");
    const pass = el.querySelector(".verdict-stamp.pass");
    take.style.opacity = Math.max(0, dx / 90);
    pass.style.opacity = Math.max(0, -dx / 90);
  });
  el.addEventListener("pointerup", async () => {
    dragging = false;
    if (dx > 110) await commitSwipe(el, bet, true);
    else if (dx < -110) await commitSwipe(el, bet, false);
    else { el.style.transform = ""; el.querySelectorAll(".verdict-stamp").forEach((s) => (s.style.opacity = 0)); }
    dx = 0;
  });
}

async function commitSwipe(el, bet, take) {
  el.classList.add("flying");
  el.style.transform = `translateX(${take ? 560 : -560}px) rotate(${take ? 24 : -24}deg)`;
  el.style.opacity = "0";
  if (!take) {
    state.dismissed.add(bet.betId);
    setTimeout(renderStack, 300);
    return;
  }
  state.busy = true;
  toast(`Locking ${bet.stake} USDT into the pot…`, 60000);
  try {
    await api("/join", { betId: bet.betId, stake: bet.stake });
    state.dismissed.add(bet.betId);
    toast(`You're on. ${bet.stake} USDT staked — winner takes ${(bet.stake * 2).toFixed(2)}.`);
  } catch (err) {
    toast(`Stake didn't go through: ${err.message}`);
    el.classList.remove("flying");
    el.style.transform = ""; el.style.opacity = "1";
  }
  state.busy = false;
  refresh();
}

// ---- composer ------------------------------------------------------------

$("fab").onclick = () => { $("composer").classList.add("open"); $("say").focus(); };
$("cancel").onclick = () => { $("composer").classList.remove("open"); resetComposer(); };

function resetComposer() {
  state.draft = null;
  $("readout").innerHTML = "";
  $("go").textContent = "READ MY BET";
  $("go").removeAttribute("disabled");
  $("note").className = "note";
  $("note").textContent = "The AI runs right here — first read can take a few seconds.";
}

$("say").addEventListener("input", () => {
  if (state.draft) resetComposer();
  $("say").value.trim() ? $("go").removeAttribute("disabled") : $("go").setAttribute("disabled", "");
});

function renderDraft(d) {
  const rows = [
    ["MATCH", `${d.home} v ${d.away}`],
    ["KICKOFF", new Date(d.kickoff).toLocaleString()],
    ["MARKET", d.market.replace("_", "/")],
    ["CALL", d.selection],
    ["STAKE", `${d.stake} USDT`],
    ["WINS IF", d.resolution],
  ];
  $("readout").innerHTML =
    rows.map(([k, v]) => `<div class="row"><span class="k">${k}</span><b>${esc(v)}</b></div>`).join("") +
    d.flags.map((f) => `<div class="row flag"><span class="k">⚑</span><b>${esc(f)}</b></div>`).join("");
}

$("go").onclick = async () => {
  const text = $("say").value.trim();
  if (!text) return;
  $("go").setAttribute("disabled", "");
  try {
    if (!state.draft) {
      $("note").textContent = "Your AI is reading it…";
      state.draft = await api("/parse", { text });
      renderDraft(state.draft);
      $("go").textContent = `POST IT — STAKE ${state.draft.stake} USDT`;
      $("note").textContent = "Check the terms — the jury settles on exactly these words.";
      $("go").removeAttribute("disabled");
    } else {
      $("note").textContent = "Locking your stake and gossiping the bet to every peer…";
      await api("/post", state.draft);
      $("composer").classList.remove("open");
      $("say").value = "";
      resetComposer();
      toast("Posted. Your bet is live on every peer's stack.");
      refresh();
    }
  } catch (err) {
    $("note").className = "note err";
    $("note").textContent = err.message;
    $("go").removeAttribute("disabled");
  }
};

refresh();
setInterval(refresh, 2000);
