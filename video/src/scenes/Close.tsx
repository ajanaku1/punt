import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, PILLARS, SCENE_DURATIONS } from "../constants";
import { INTER, MONO } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { GlowText } from "../components/GlowText";

export const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_DURATIONS.close;

  const fadeOut = interpolate(frame, [dur - 60, dur], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", opacity: fadeOut }}>
        {/* corner brackets */}
        {[
          { top: 60, left: 60, bt: true, bl: true },
          { top: 60, right: 60, bt: true, br: true },
          { bottom: 60, left: 60, bb: true, bl: true },
          { bottom: 60, right: 60, bb: true, br: true },
        ].map((c, i) => (
          <div key={i} style={{
            position: "absolute", width: 55, height: 55,
            top: c.top, left: c.left, right: c.right, bottom: c.bottom,
            borderTop: c.bt ? `3px solid ${COLORS.accent}55` : undefined,
            borderBottom: c.bb ? `3px solid ${COLORS.accent}55` : undefined,
            borderLeft: c.bl ? `3px solid ${COLORS.accent}55` : undefined,
            borderRight: c.br ? `3px solid ${COLORS.accent}55` : undefined,
            opacity: interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" }),
          }} />
        ))}
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <GlowText text="PUNT" fontSize={110} color={COLORS.white} delay={5} fontWeight={900}
            style={{ fontStyle: "italic", letterSpacing: "-0.02em" }} />
          <GlowText text="/" fontSize={110} color={COLORS.accent} delay={10} fontWeight={900}
            glowIntensity={1.6} style={{ fontStyle: "italic" }} />
        </div>
        <GlowText text="No bookmaker. No server. No oracle." fontSize={34} color={COLORS.offWhite}
          delay={25} fontWeight={600} style={{ marginTop: 14 }} />
        <div style={{ display: "flex", gap: 60, marginTop: 64 }}>
          {PILLARS.map((p, i) => {
            const d = 55 + i * 18;
            const prog = spring({ frame: frame - d, fps, config: { damping: 15, stiffness: 100 } });
            const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
            return (
              <div key={p.name} style={{ opacity: op, textAlign: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: p.color, letterSpacing: "0.14em" }}>{p.name}</div>
                <div style={{ fontFamily: INTER, fontSize: 19, color: COLORS.muted, marginTop: 6 }}>{p.role}</div>
              </div>
            );
          })}
        </div>
        <GlowText text="Built for the Tether Developers Cup" fontSize={22} color={COLORS.muted}
          delay={130} fontWeight={500} style={{ marginTop: 70 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
