import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { INTER } from "./fonts";
import { AUDIO_DURATIONS, SCENE_DURATIONS, CROSSFADE } from "./constants";

// Sentence-level subtitles, timed by word share of each scene's audio.
const SCRIPT: Record<keyof typeof AUDIO_DURATIONS, string[]> = {
  hook: [
    "Every betting app is a company.",
    "It hosts the markets, settles them, and takes a cut.",
    "Punt is a football bet between friends, where the company can't exist.",
  ],
  noserver: [
    "There's no server anywhere.",
    "Bets travel peer to peer on Tether's Pears stack.",
    "Stakes live in self-custodial WDK wallets.",
    "And every drop of AI runs on your own machine with QVAC. No cloud.",
  ],
  composer: [
    "I type my bet the way I'd say it in the group chat.",
    "The model on my laptop turns it into terms a jury can grade, and flags anything it had to guess.",
    "When I post, my USDT locks into an on-chain escrow.",
  ],
  swipe: [
    "The bet gossips to every peer over an Autobase feed.",
    "My friend swipes right, her wallet matches my stake, and the pot holds both sides on-chain.",
    "Junk bets never get this far — every peer validates the schema before acknowledging a single byte.",
  ],
  jury: [
    "Settlement needs no oracle.",
    "Three peers each fetch the official result and grade the bet with their own on-device model, at temperature zero.",
    "Each one signs its verdict, and two matching signatures release the pot — the contract checks the jury's cryptography itself.",
    "Portugal beat Croatia two one, the jury agrees, and the winner takes the pot.",
  ],
  close: [
    "Posted in plain English. Matched with a swipe.",
    "Settled by machines that answer to no one.",
    "Pears moves the bets, QVAC is the brain, WDK holds the money.",
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
