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

export const SCENE_GAP = Math.round(1.3 * FPS);

// ffprobe durations of the generated audio (seconds × FPS)
export const AUDIO_DURATIONS = {
  hook: Math.round(8.96 * FPS),
  noserver: Math.round(13.1 * FPS),
  composer: Math.round(10.72 * FPS),
  swipe: Math.round(13.52 * FPS),
  jury: Math.round(19.74 * FPS),
  close: Math.round(11.45 * FPS),
} as const;

export const SCENE_DURATIONS = {
  hook: AUDIO_DURATIONS.hook + SCENE_GAP,
  noserver: AUDIO_DURATIONS.noserver + SCENE_GAP,
  composer: AUDIO_DURATIONS.composer + SCENE_GAP,
  swipe: AUDIO_DURATIONS.swipe + SCENE_GAP,
  jury: AUDIO_DURATIONS.jury + SCENE_GAP,
  close: AUDIO_DURATIONS.close + Math.round(2.5 * FPS), // hold + slow fade
} as const;

export const CROSSFADE = 24;

export const TOTAL_FRAMES =
  Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0) -
  CROSSFADE * (Object.keys(SCENE_DURATIONS).length - 1);

export const AUDIO_FILES: Record<keyof typeof SCENE_DURATIONS, string> = {
  hook: "audio/hook.mp3",
  noserver: "audio/noserver.mp3",
  composer: "audio/composer.mp3",
  swipe: "audio/swipe.mp3",
  jury: "audio/jury.mp3",
  close: "audio/close.mp3",
};

// REAL juror output — copied verbatim from the live run logs (real-only principle).
// Populated from the Portugal v Croatia settlement run.
export const JURY_TERMINAL: { text: string; color: "prompt" | "text" | "green" | "yellow" | "red" | "blue" | "purple" }[] = [
  { text: "$ npm run demo    # three jurors, each its own machine-local model", color: "prompt" },
  { text: "[juror 1] loading local model…", color: "text" },
  { text: "[juror 2] loading local model…", color: "text" },
  { text: "[juror 3] loading local model…", color: "text" },
  { text: "[juror 1] fetching official result: Portugal v Croatia", color: "blue" },
  // verdict lines injected from the live run — see fillJuryLines note in scenes/Jury.tsx
];

export const PILLARS = [
  { name: "PEARS", role: "moves the bets", detail: "Autobase feed, peer to peer", color: "#22d3ee" },
  { name: "QVAC", role: "is the brain", detail: "every model on-device", color: "#c8f03c" },
  { name: "WDK", role: "holds the money", detail: "self-custodial USDT", color: "#eab308" },
];

export const SOCIAL_FPS = 30;
export const SOCIAL_W = 1080;
export const SOCIAL_H = 1920;
export const SOCIAL_DURATION = 11 * FPS;
