/* Renderer logic: poll the peer daemon, drive the tabs, swipe stack, composer. */
const API = new URLSearchParams(location.search).get("api") ?? "http://127.0.0.1:9701";

const $ = (id) => document.getElementById(id);
const state = { bets: [], me: null, skipped: new Set(), revisiting: false, busy: false, draft: null, tab: "home", dragging: false, deckSignature: "" };

async function api(path, body) {
  const res = await fetch(API + path, body ? { method: "POST", body: JSON.stringify(body) } : undefined);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "request failed");
  return json;
}

/** Streamed parse over SSE: onDelta gets the model's output as it is written. */
async function apiParse(text, onDelta) {
  const res = await fetch(API + "/parse", { method: "POST", body: JSON.stringify({ text }) });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const event = frame.match(/^event: (.+)$/m)?.[1];
      const data = JSON.parse(frame.match(/^data: (.+)$/m)?.[1] ?? "{}");
      if (event === "delta") onDelta(data.text);
      else if (event === "done") result = data;
      else if (event === "error") throw new Error(data.error);
    }
  }
  if (!result) throw new Error("superseded"); // a newer parse cancelled this one
  return result;
}

function toast(msg, ms = 2600) {
  $("toast").textContent = msg;
  $("toast").style.display = "block";
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ($("toast").style.display = "none"), ms);
}

// every bet field came off the wire from a peer — escape before it touches innerHTML
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---- tabs ------------------------------------------------------------------

document.querySelectorAll(".tab").forEach((el) => {
  el.onclick = () => {
    state.tab = el.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === el));
    document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === `page-${state.tab}`));
    render();
  };
});

// ---- polling ----------------------------------------------------------------

async function refresh() {
  try {
    const snap = await api("/state");
    state.me = snap;
    state.bets = snap.bets;
    $("usdt").textContent = snap.usdt.toFixed(2);
    const open = snap.bets.filter((b) => b.potStatus === "open").length;
    const model = snap.modelReady ? "AI READY" : `AI LOADING ${Math.round(snap.modelProgress)}%`;
    $("ticker").innerHTML = `LIVE FEED · <b>${open} OPEN</b> · ${snap.bets.length} TOTAL · <b>${model}</b> · NO BOOKIE · NO SERVER`;
    render();
  } catch {
    $("ticker").textContent = "PEER DAEMON UNREACHABLE — IS IT RUNNING?";
  }
}

function render() {
  if (state.tab === "home") renderStack();
  if (state.tab === "history") renderHistory();
  if (state.tab === "profile") renderProfile();
}

// ---- HOME: card stack --------------------------------------------------------

function swipeable() {
  const open = state.bets.filter((b) => !b.mine && !b.joinedByMe && b.potStatus === "open");
  return state.revisiting ? open.filter((b) => state.skipped.has(b.betId)) : open.filter((b) => !state.skipped.has(b.betId));
}

function cardHtml(bet) {
  const kick = new Date(bet.match.kickoff);
  const when = kick.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const short = (t) => esc(t.length > 12 ? t.slice(0, 11) + "…" : t);
  const revisit = state.revisiting && state.skipped.has(bet.betId);
  return `
    <span class="comp-tag ${revisit ? "skipped" : ""}">${revisit ? "SECOND LOOK" : "OPEN BET"}</span>
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
  if (state.dragging) return; // never yank the card out from under a finger
  const deck = swipeable();
  const signature = deck.slice(0, 2).map((b) => b.betId).join("|") + (state.revisiting ? "|r" : "");
  if (signature === state.deckSignature && deck.length) return; // deck unchanged — leave the DOM alone
  state.deckSignature = signature;
  const stack = $("stack");
  stack.querySelectorAll(".card").forEach((el) => el.remove());

  const skippedOpen = state.bets.filter((b) => !b.mine && !b.joinedByMe && b.potStatus === "open" && state.skipped.has(b.betId));
  const showEmpty = deck.length === 0;
  $("empty").style.display = showEmpty ? "flex" : "none";
  document.querySelector(".hints").style.visibility = showEmpty ? "hidden" : "visible";
  if (showEmpty) {
    if (state.revisiting) {
      state.revisiting = false; // second pass exhausted too
      $("empty-sub").textContent = "That's everything, including your skipped pile. New bets land here as peers post them.";
    } else {
      $("empty-sub").textContent = skippedOpen.length
        ? `You're through the stack. ${skippedOpen.length} bet${skippedOpen.length > 1 ? "s" : ""} you passed on ${skippedOpen.length > 1 ? "are" : "is"} still open.`
        : "When a mate posts a bet, it lands here. Or call your own shot with +.";
    }
    $("revisit").style.display = skippedOpen.length ? "block" : "none";
    return;
  }

  if (deck[1]) {
    const behind = document.createElement("div");
    behind.className = "card behind";
    behind.innerHTML = cardHtml(deck[1]);
    stack.appendChild(behind);
  }
  const top = document.createElement("div");
  top.className = "card";
  top.innerHTML = cardHtml(deck[0]);
  stack.appendChild(top);
  attachSwipe(top, deck[0]);
}

$("revisit").onclick = () => {
  state.revisiting = true;
  renderStack();
  toast("Second look — the bets you passed on.");
};

function attachSwipe(el, bet) {
  let startX = 0, dx = 0, dragging = false;
  el.addEventListener("pointerdown", (e) => {
    if (state.busy) return;
    dragging = true; state.dragging = true; startX = e.clientX; el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    el.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
    el.querySelector(".verdict-stamp.take").style.opacity = Math.max(0, dx / 90);
    el.querySelector(".verdict-stamp.pass").style.opacity = Math.max(0, -dx / 90);
  });
  el.addEventListener("pointerup", async () => {
    dragging = false; state.dragging = false;
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
    state.skipped.add(bet.betId);
    setTimeout(renderStack, 300);
    return;
  }
  state.busy = true;
  toast(`Locking ${bet.stake} USDT into the pot…`, 60000);
  try {
    await api("/join", { betId: bet.betId, stake: bet.stake });
    state.skipped.delete(bet.betId);
    toast(`You're on. ${bet.stake} USDT staked — winner takes ${(bet.stake * 2).toFixed(2)}.`);
  } catch (err) {
    toast(`Stake didn't go through: ${err.message}`);
    el.classList.remove("flying");
    el.style.transform = ""; el.style.opacity = "1";
  }
  state.busy = false;
  refresh();
}

// ---- HISTORY ------------------------------------------------------------------

function outcomePill(bet) {
  if (bet.potStatus === "settled") {
    const iWon = bet.winnerAddress === state.me.address;
    const involved = bet.mine || bet.joinedByMe;
    if (involved) return `<span class="pill ${iWon ? "won" : "lost"}">${iWon ? "WON" : "LOST"}</span>`;
    return `<span class="pill open">SETTLED</span>`;
  }
  if (bet.potStatus === "matched") return `<span class="pill matched">MATCHED</span>`;
  return `<span class="pill open">OPEN</span>`;
}

function historyRow(bet, pillOverride) {
  const who = bet.mine ? "your call" : bet.joinedByMe ? "you matched it" : `peer ${esc(bet.creator.slice(0, 8))}…`;
  const verdict = bet.verdicts?.[0];
  const reason = bet.potStatus === "settled" && verdict ? `<div class="reason">jury: ${esc(verdict.reasoning ?? "")}</div>` : "";
  return `<div class="hrow">
    <div class="top"><span class="sel">${esc(bet.selection)}</span>${pillOverride ?? outcomePill(bet)}</div>
    <div class="fixture">${esc(bet.match.home)} v ${esc(bet.match.away)} · ${new Date(bet.match.kickoff).toLocaleDateString()}</div>
    ${reason}
    <div class="foot"><span>${who}</span><span>${bet.stake.toFixed(2)} USDT each way</span></div>
  </div>`;
}

function renderHistory() {
  const mine = state.bets.filter((b) => b.mine || b.joinedByMe);
  const skipped = state.bets.filter((b) => !b.mine && !b.joinedByMe && state.skipped.has(b.betId) && b.potStatus === "open");
  const rest = state.bets.filter((b) => !b.mine && !b.joinedByMe && !(state.skipped.has(b.betId) && b.potStatus === "open"));
  const section = (label, bets, pill) =>
    bets.length ? `<div class="section-label">${label}</div>` + bets.map((b) => historyRow(b, pill)).join("") : "";
  const html =
    section("Your bets", mine.slice().reverse()) +
    section("Passed on — still open", skipped, `<span class="pill skipped">SKIPPED</span>`) +
    section("Around the feed", rest.slice().reverse());
  $("history-list").innerHTML = html || `<div class="empty-line">No bets yet. Post one from Home, or wait for the feed.</div>`;
}

// ---- PROFILE --------------------------------------------------------------------

function renderProfile() {
  const me = state.me;
  if (!me) return;
  const mine = state.bets.filter((b) => b.mine);
  const joined = state.bets.filter((b) => b.joinedByMe);
  const settledInvolved = state.bets.filter((b) => (b.mine || b.joinedByMe) && b.potStatus === "settled");
  const won = settledInvolved.filter((b) => b.winnerAddress === me.address).length;
  $("profile").innerHTML = `
    <div class="id-card">
      <div class="role">SELF-CUSTODY WALLET · ${esc(me.role)}</div>
      <div class="addr">${esc(me.address)}</div>
      <div class="copy" id="copy-addr">copy address</div>
      <div class="balances">
        <div class="stat"><div class="v lime">${me.usdt.toFixed(2)}</div><div class="k">USDT</div></div>
        <div class="stat"><div class="v">${Number(me.eth).toFixed(4)}</div><div class="k">ETH (gas)</div></div>
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="v">${mine.length}</div><div class="k">Posted</div></div>
      <div class="stat"><div class="v">${joined.length}</div><div class="k">Matched</div></div>
      <div class="stat"><div class="v lime">${won}</div><div class="k">Won</div></div>
      <div class="stat"><div class="v">${settledInvolved.length - won}</div><div class="k">Lost</div></div>
    </div>
    <div class="kv">
      <div class="row"><span class="k">Peer key</span><b>${esc((me.peerKey ?? me.feedKey).slice(0, 20))}…</b></div>
      <div class="row"><span class="k">Local AI</span><b>${me.modelReady ? "Llama 3.2 1B · ready" : `loading ${Math.round(me.modelProgress)}%`}</b></div>
      <div class="row"><span class="k">Jury</span><b>3 peers · 2 must agree</b></div>
      <div class="row"><span class="k">Custody</span><b>your keys, your machine</b></div>
    </div>`;
  $("copy-addr").onclick = () => {
    navigator.clipboard.writeText(me.address);
    toast("Address copied.");
  };
}

// ---- composer ---------------------------------------------------------------------

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

// ---- speech-to-bet: mic → 16k mono WAV → on-device Whisper → composer ------

function encodeWav(samples, inRate) {
  // downsample to 16k mono PCM16 — the shape every whisper build accepts
  const outRate = 16000;
  const ratio = inRate / outRate;
  const n = Math.floor(samples.length / ratio);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[Math.floor(i * ratio)]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (off, s) => [...s].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, outRate, true); v.setUint32(28, outRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

let rec = null; // { ctx, stream, node, chunks }
$("mic").onclick = async () => {
  if (rec) {
    // stop → encode → transcribe on-device → drop into the box and parse
    const { ctx, stream, node, chunks } = rec;
    rec = null;
    $("mic").classList.remove("rec");
    node.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    const samples = new Float32Array(chunks.reduce((a, c) => a + c.length, 0));
    let off = 0;
    for (const c of chunks) { samples.set(c, off); off += c.length; }
    await ctx.close();
    if (samples.length < ctx.sampleRate / 4) return; // a blip, not speech
    try {
      $("note").className = "note";
      $("note").textContent = "Transcribing on this device… first use fetches the speech model.";
      const { text } = await api("/transcribe", { audio: encodeWav(samples, ctx.sampleRate) });
      if (!text) throw new Error("didn't catch that — try again closer to the mic");
      $("say").value = text;
      $("say").dispatchEvent(new Event("input"));
      $("go").click(); // straight into the same parse pipeline as typing
    } catch (err) {
      $("note").className = "note err";
      $("note").textContent = err.message;
    }
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    src.connect(node);
    node.connect(ctx.destination);
    rec = { ctx, stream, node, chunks };
    $("mic").classList.add("rec");
    $("note").className = "note";
    $("note").textContent = "Listening — tap the mic again when you're done.";
  } catch {
    $("note").className = "note err";
    $("note").textContent = "Mic unavailable — type it instead.";
  }
};

$("go").onclick = async () => {
  const text = $("say").value.trim();
  if (!text) return;
  $("go").setAttribute("disabled", "");
  try {
    if (!state.draft) {
      $("note").textContent = "Your AI is reading it…";
      // watch the on-device model write the terms, token by token
      state.draft = await apiParse(text, (soFar) => {
        $("readout").innerHTML = `<div class="row stream"><b>${esc(soFar)}</b></div>`;
      });
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
    if (err.message === "superseded") return; // a newer parse took over this composer
    $("note").className = "note err";
    $("note").textContent = err.message;
    $("go").removeAttribute("disabled");
  }
};

refresh();
setInterval(refresh, 2000);
