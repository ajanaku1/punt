import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { GlowText } from "../components/GlowText";

const STRIKES = ["NO BOOKIE", "NO SERVER", "NO ORACLE"];

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
        {/* brand */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <GlowText text="PUNT" fontSize={130} color={COLORS.white} delay={5} fontWeight={900}
            style={{ fontStyle: "italic", letterSpacing: "-0.02em" }} />
          <GlowText text="/" fontSize={130} color={COLORS.accent} delay={12} fontWeight={900}
            glowIntensity={1.6} style={{ fontStyle: "italic" }} />
        </div>
        <GlowText
          text="Swipe-to-stake football bets between friends"
          fontSize={34} color={COLORS.offWhite} delay={35} fontWeight={500}
          style={{ marginTop: 18 }}
        />
        {/* the three strikes */}
        <div style={{ display: "flex", gap: 26, marginTop: 70 }}>
          {STRIKES.map((s, i) => {
            const d = 90 + i * 40;
            const prog = spring({ frame: frame - d, fps, config: { damping: 14, stiffness: 130 } });
            const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
            const scale = interpolate(prog, [0, 1], [0.93, 1]);
            return (
              <div key={s} style={{
                opacity: op, transform: `scale(${scale})`,
                background: COLORS.accent, color: "#101502",
                fontFamily: INTER, fontWeight: 900, fontStyle: "italic",
                fontSize: 34, letterSpacing: "0.04em", padding: "14px 34px",
                clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)",
                boxShadow: `0 10px 40px ${COLORS.accent}30`,
              }}>
                {s}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
