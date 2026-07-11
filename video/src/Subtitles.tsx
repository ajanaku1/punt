import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { INTER } from "./fonts";
import { AUDIO_DURATIONS, SCENE_DURATIONS, CROSSFADE } from "./constants";

// Sentence-level subtitles, timed by word share of each scene's audio.
const SCRIPT: Record<keyof typeof AUDIO_DURATIONS, string[]> = {
  hook: [
    "You and your mates are certain about the match, so you put a few quid on it.",
    "But every betting app is a company. It holds your money, sets the odds, decides who won, and takes a cut.",
    "Punt is the version where that company doesn't exist.",
  ],
  noserver: [
    "No bookie. No server. No house.",
    "Punt is a bet between friends, running on three parts of Tether's stack, and each one does real work.",
    "Your phones talk to each other directly with Pears.",
    "The AI runs on your own device with QVAC.",
    "And your money stays in your own wallet with WDK.",
  ],
  composer: [
    "You type your bet the way you'd say it in the group chat. Or just tap the mic and say it out loud.",
    "Everything runs on your own laptop: the speech, and the model that turns your words into something a jury can settle, flagging anything it had to guess.",
    "Hit post, and your stake locks into an escrow you can see on-chain.",
  ],
  dht: [
    "Your bet goes straight to your friends' devices.",
    "They find each other directly, with no server in the middle and nothing to shut down.",
    "And the feed is encrypted, so only your group can read the pots.",
  ],
  swipe: [
    "Your mate swipes right to take the other side.",
    "Her wallet matches your stake, and the pot now holds both sides on-chain.",
    "Cheats and junk never make it in, because the feed only trusts a bet really signed by the person who sent it.",
  ],
  jury: [
    "Then the match ends, and here's the real question. Who decides who won?",
    "Not a company. Three of your peers each grade the result with an AI on their own machine, and sign the outcome.",
    "When two of them agree, the pot pays out.",
    "No oracle. No referee you're forced to trust.",
  ],
  explorer: [
    "And none of it happens in the dark.",
    "Every settle lands on Base Sepolia, out in the open, for anyone to check.",
    "The contract itself confirms the jury before a single coin moves.",
  ],
  close: [
    "No bookie. No server. No oracle.",
    "Just you, your friends, and a bet that settles itself.",
    "Pears carries it, QVAC is the brain, WDK holds the money.",
    "That's Punt.",
  ],
};

type Entry = { text: string; startFrame: number; endFrame: number };

function buildEntries(): Entry[] {
  const entries: Entry[] = [];
  let sceneStart = 0;
  for (const key of Object.keys(SCRIPT) as (keyof typeof SCRIPT)[]) {
    const sentences = SCRIPT[key];
    const audio = AUDIO_DURATIONS[key];
    const total = sentences.reduce((a, s) => a + s.split(/\s+/).length, 0);
    let used = 0;
    for (const s of sentences) {
      const words = s.split(/\s+/).length;
      entries.push({
        text: s,
        startFrame: Math.round(sceneStart + (used / total) * audio),
        endFrame: Math.round(sceneStart + ((used + words) / total) * audio),
      });
      used += words;
    }
    sceneStart += SCENE_DURATIONS[key] - CROSSFADE;
  }
  return entries;
}

const ENTRIES = buildEntries();

export const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const active = ENTRIES.find((e) => frame >= e.startFrame && frame < e.endFrame);
  if (!active) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", zIndex: 50 }}>
      <div style={{
        background: "rgba(0,0,0,0.65)", borderRadius: 8,
        padding: "10px 24px", marginBottom: 46, maxWidth: 1500,
      }}>
        <div style={{
          fontFamily: INTER, fontSize: 28, fontWeight: 600,
          color: "#ffffff", textAlign: "center", lineHeight: 1.4,
        }}>
          {active.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
