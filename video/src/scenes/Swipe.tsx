import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { GlowText } from "../components/GlowText";
import { PhoneShell } from "../components/PhoneShell";

const POINTS = [
  { text: "Gossiped peer to peer", detail: "Autobase optimistic replication — no backend saw it", enter: 60 },
  { text: "Swipe right = matched stake", detail: "her WDK wallet counter-stakes the pot on-chain", enter: 160 },
  { text: "Junk dies at the door", detail: "every peer validates before acknowledging", enter: 260 },
];

export const Swipe: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 110px", gap: 90 }}>
        <div style={{ flex: 1 }}>
          <GlowText text="Your mate's phone" fontSize={64} color={COLORS.white} delay={16}
            style={{ fontStyle: "italic" }} />
          <div style={{ marginTop: 46, display: "flex", flexDirection: "column", gap: 26 }}>
            {POINTS.map((p, i) => {
              const prog = spring({ frame: frame - p.enter, fps, config: { damping: 15, stiffness: 90 } });
              const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
              const x = interpolate(prog, [0, 1], [24, 0]);
              return (
                <div key={i} style={{
                  opacity: op, transform: `translateX(${-x}px)`,
                  background: COLORS.bgCard, borderLeft: `4px solid ${COLORS.cyan}`,
                  padding: "22px 28px",
                }}>
                  <div style={{ fontFamily: INTER, fontSize: 30, fontWeight: 800, color: COLORS.white }}>{p.text}</div>
                  <div style={{ fontFamily: INTER, fontSize: 20, color: COLORS.offWhite, marginTop: 6 }}>{p.detail}</div>
                </div>
              );
            })}
          </div>
        </div>
        {/* real recording: the bet arrives, slow swipe right, stake locks */}
        <PhoneShell src="assets/swipe-rec.mp4" label="her phone" delay={5} startFrom={45} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
