import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, SOCIAL_DURATION, PILLARS } from "./constants";
import { INTER, MONO } from "./fonts";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { GlowText } from "./components/GlowText";

const VERTICAL_ORBS = [
  { baseX: 200, baseY: 300, size: 400, color: COLORS.accent, blur: 120, opacity: 0.1, speed: 0.006 },
  { baseX: 880, baseY: 1600, size: 360, color: COLORS.cyan, blur: 110, opacity: 0.09, speed: 0.005 },
  { baseX: 540, baseY: 960, size: 480, color: "#3a5bd9", blur: 140, opacity: 0.08, speed: 0.008 },
];

const STRIKES = ["NO BOOKIE", "NO SERVER", "NO ORACLE"];

export const SocialClip: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitOp = interpolate(frame, [SOCIAL_DURATION - 20, SOCIAL_DURATION], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground orbs={VERTICAL_ORBS} />
      <AbsoluteFill style={{
        flexDirection: "column", justifyContent: "center", alignItems: "center",
        padding: "80px 60px", opacity: exitOp,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
          <GlowText text="PUNT" fontSize={120} color={COLORS.white} delay={5} fontWeight={900}
            style={{ fontStyle: "italic" }} />
          <GlowText text="/" fontSize={120} color={COLORS.accent} delay={10} fontWeight={900}
            glowIntensity={1.6} style={{ fontStyle: "italic" }} />
        </div>
        <GlowText text="Swipe-to-stake football bets" fontSize={38} color={COLORS.offWhite} delay={25}
          fontWeight={600} style={{ marginTop: 12, marginBottom: 90 }} />
        {STRIKES.map((s, i) => {
          const d = 45 + i * 30;
          const prog = spring({ frame: frame - d, fps, config: { damping: 14, stiffness: 130 } });
          const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
          const scale = interpolate(prog, [0, 1], [0.93, 1]);
          return (
            <div key={s} style={{
              opacity: op, transform: `scale(${scale})`,
              background: COLORS.accent, color: "#101502",
              fontFamily: INTER, fontWeight: 900, fontStyle: "italic",
              fontSize: 52, letterSpacing: "0.04em", padding: "18px 52px", marginBottom: 26,
              clipPath: "polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)",
              boxShadow: `0 10px 40px ${COLORS.accent}30`,
            }}>
              {s}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 44, marginTop: 90 }}>
          {PILLARS.map((p, i) => {
            const prog = spring({ frame: frame - (150 + i * 15), fps, config: { damping: 15, stiffness: 100 } });
            const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
            return (
              <div key={p.name} style={{ opacity: op, fontFamily: MONO, fontSize: 30, fontWeight: 700, color: p.color, letterSpacing: "0.12em" }}>
                {p.name}
              </div>
            );
          })}
        </div>
        <GlowText text="Settled by a jury of on-device AI" fontSize={30} color={COLORS.muted} delay={190}
          fontWeight={500} style={{ marginTop: 60 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
