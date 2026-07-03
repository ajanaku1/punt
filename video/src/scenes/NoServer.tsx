import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, PILLARS } from "../constants";
import { INTER, MONO } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { GlowText } from "../components/GlowText";

export const NoServer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", padding: 80 }}>
        <GlowText text="Three Tether stacks. Zero infrastructure." fontSize={54} color={COLORS.white} delay={8} />
        <div style={{ display: "flex", gap: 30, marginTop: 80, width: "100%", maxWidth: 1560 }}>
          {PILLARS.map((p, i) => {
            const d = 45 + i * 55;
            const prog = spring({ frame: frame - d, fps, config: { damping: 15, stiffness: 90 } });
            const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
            const y = interpolate(prog, [0, 1], [26, 0]);
            return (
              <div key={p.name} style={{
                flex: 1, opacity: op, transform: `translateY(${y}px)`,
                background: COLORS.bgCard, borderTop: `1px solid rgba(255,255,255,0.07)`,
                borderLeft: `4px solid ${p.color}`,
                padding: "40px 36px",
                clipPath: "polygon(0 14px, 14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)",
                boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
              }}>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: p.color, letterSpacing: "0.16em" }}>
                  {p.name}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 34, fontWeight: 800, color: COLORS.white, marginTop: 14, fontStyle: "italic" }}>
                  {p.role}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 21, color: COLORS.offWhite, marginTop: 12 }}>
                  {p.detail}
                </div>
              </div>
            );
          })}
        </div>
        <GlowText
          text="If any one of these were removable, it would just be another betting site."
          fontSize={26} color={COLORS.muted} delay={230} fontWeight={500} style={{ marginTop: 64 }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
