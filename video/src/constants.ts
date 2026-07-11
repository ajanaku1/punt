// All content for the Punt demo video lives here. Scenes read, never hardcode.
export const FPS = 30;
export const W = 1920;
export const H = 1080;

// Broadcast theme — the app's own design system
export const COLORS = {
  bg: "#090c12",
  bgCard: "rgba(15,20,29,0.75)",
  surface: "#0f141d",
  elevated: "#171e2a",
  accent: "#c8f03c",
  accentDim: "#8fae26",
  accentBright: "#d9f56a",
  white: "#eef1f6",
  offWhite: "#b4bcc9",
  muted: "#5d6674",
  border: "rgba(200,240,60,0.18)",
  red: "#e2564a",
  amber: "#eab308",
  cyan: "#22d3ee",
};

export const TERMINAL = {
  bg: "#0a0e15",
  text: "#c3cad6",
  green: "#c8f03c",
  yellow: "#eab308",
  red: "#f85149",
  blue: "#58a6ff",
  purple: "#bc8cff",
  prompt: "#8b949e",
};

export const SCENE_GAP = Math.round(1.5 * FPS);

// ffprobe durations of the generated audio (seconds × FPS)
export const AUDIO_DURATIONS = {
  hook: Math.round(15.82 * FPS),
  noserver: Math.round(19.85 * FPS),
  composer: Math.round(20.4 * FPS),
  dht: Math.round(12.94 * FPS),
  swipe: Math.round(15.24 * FPS),
  jury: Math.round(18.7 * FPS),
  explorer: Math.round(12.17 * FPS),
  close: Math.round(14.21 * FPS),
} as const;

export const SCENE_DURATIONS = {
  hook: AUDIO_DURATIONS.hook + SCENE_GAP,
  noserver: AUDIO_DURATIONS.noserver + SCENE_GAP,
  composer: AUDIO_DURATIONS.composer + SCENE_GAP,
  dht: AUDIO_DURATIONS.dht + SCENE_GAP,
  swipe: AUDIO_DURATIONS.swipe + SCENE_GAP,
  jury: AUDIO_DURATIONS.jury + SCENE_GAP,
  explorer: AUDIO_DURATIONS.explorer + SCENE_GAP,
  close: AUDIO_DURATIONS.close + Math.round(2.5 * FPS), // hold + slow fade
} as const;

export const CROSSFADE = 32; // ~1.1s — smoother scene-to-scene blend

export const TOTAL_FRAMES =
  Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0) -
  CROSSFADE * (Object.keys(SCENE_DURATIONS).length - 1);

export const AUDIO_FILES: Record<keyof typeof SCENE_DURATIONS, string> = {
  hook: "audio/hook.mp3",
  noserver: "audio/noserver.mp3",
  composer: "audio/composer.mp3",
  dht: "audio/dht.mp3",
  swipe: "audio/swipe.mp3",
  jury: "audio/jury.mp3",
  explorer: "audio/explorer.mp3",
  close: "audio/close.mp3",
};

// REAL juror output — copied verbatim from the live Portugal v Croatia
// settlement run (truncated mid-sentence only). Real-only principle.
export const JURY_TERMINAL: { text: string; color: "prompt" | "text" | "green" | "yellow" | "red" | "blue" | "purple" }[] = [
  { text: "$ npm run demo    # three jurors, each with its own on-device model", color: "prompt" },
  { text: "[juror 1] loading local model…", color: "text" },
  { text: "[juror 2] loading local model…", color: "text" },
  { text: "[juror 3] loading local model…", color: "text" },
  { text: "[juror 2] VERDICT on f317e99eb027…: creator WINS — The official final score at full time was", color: "green" },
  { text: "          Portugal 2, Croatia 1. Since the official result shows Portugal winning 2-1, the", color: "green" },
  { text: "          condition held true.", color: "green" },
  { text: "[juror 1] VERDICT on f317e99eb027…: creator WINS — Portugal 2, Croatia 1 at full time.", color: "green" },
  { text: "[juror 3] VERDICT on f317e99eb027…: creator WINS — Portugal 2, Croatia 1 at full time.", color: "green" },
  { text: "[CREATOR] jury majority says we won f317e99eb027… — settling", color: "yellow" },
  { text: "[CREATOR] pot released — the winner's USDT is home", color: "yellow" },
];

export const PILLARS = [
  { name: "PEARS", role: "moves the bets", detail: "Autobase feed, peer to peer", color: "#22d3ee" },
  { name: "QVAC", role: "is the brain", detail: "every model on-device", color: "#c8f03c" },
  { name: "WDK", role: "holds the money", detail: "self-custodial USDT", color: "#eab308" },
];

// --- DHT peer-discovery scene ---
// DHT_TOPIC is the REAL discovery key of the demo feed: crypto.discoveryKey(FEED_KEY).
export const DHT_TOPIC = "74ee1fd9c04383298a8ab0b4556f27f1ee14b487d034f8fee89ec49be4e2e54b";
export const DHT_NODES = ["CREATOR", "JOINER", "JUROR 1", "JUROR 2", "JUROR 3"];

// --- Explorer scene ---
// Real Base Sepolia deployment. betId is from the real Portugal v Croatia settle run
// (same run the Jury terminal quotes). No fabricated tx hash is shown.
export const EXPLORER = {
  network: "Base Sepolia",
  contract: "0xc98aC5F473FfAA871f66A09c6cCb1c8D95579DD8",
  contractShort: "0xc98aC5…9DD8",
  url: "sepolia.basescan.org/address/0xc98aC5…9DD8",
  event: "Settled",
  method: "settle",
  betId: "0xf317e99eb027…",
  payout: "10.0 USDT",
};

export const SOCIAL_FPS = 30;
export const SOCIAL_W = 1080;
export const SOCIAL_H = 1920;
export const SOCIAL_DURATION = 11 * FPS;
