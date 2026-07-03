import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { GlowText } from "../components/GlowText";
import { PhoneShell } from "../components/PhoneShell";

const POINTS = [
  { text: "Plain English in", detail: "typed like a group-chat message", enter: 70 },
  { text: "On-device AI drafts the terms", detail: "QVAC — nothing leaves this laptop", enter: 150 },
  { text: "Post = stake locked", detail: "WDK wallet funds the on-chain escrow", enter: 240 },
];

export const Composer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 110px", gap: 90 }}>
        {/* real recording: typing the Portugal bet, model reads it back, POST */}
        <PhoneShell src="assets/composer-rec.mp4" label="your phone" delay={5} startFrom={60} />
        <div style={{ flex: 1 }}>
          <GlowText text="Call your shot" fontSize={64} color={COLORS.white} delay={16}
            style={{ fontStyle: "italic" }} />
          <div style={{ marginTop: 46, display: "flex", flexDirection: "column", gap: 26 }}>
            {POINTS.map((p, i) => {
              const prog = spring({ frame: frame - p.enter, fps, config: { damping: 15, stiffness: 90 } });
              const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
              const x = interpolate(prog, [0, 1], [-24, 0]);
              return (
                <div key={i} style={{
                  opacity: op, transform: `translateX(${x}px)`,
                  background: COLORS.bgCard, borderLeft: `4px solid ${COLORS.accent}`,
                  padding: "22px 28px",
                }}>
                  <div style={{ fontFamily: INTER, fontSize: 30, fontWeight: 800, color: COLORS.white }}>{p.text}</div>
                  <div style={{ fontFamily: INTER, fontSize: 20, color: COLORS.offWhite, marginTop: 6 }}>{p.detail}</div>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
