import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, JURY_TERMINAL } from "../constants";
import { INTER } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { GlowText } from "../components/GlowText";
import { Terminal } from "../components/Terminal";

export const Jury: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // settle banner after the verdicts have typed out
  const bannerAt = 430;
  const prog = spring({ frame: frame - bannerAt, fps, config: { damping: 13, stiffness: 120 } });
  const bannerOp = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const bannerScale = interpolate(prog, [0, 1], [0.93, 1]);

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", padding: "0 100px" }}>
        <GlowText text="The jury is three machines" fontSize={54} color={COLORS.white} delay={8}
          style={{ marginBottom: 40, fontStyle: "italic" }} />
        <Terminal lines={JURY_TERMINAL} delay={30} charsPerFrame={2.1} />
        <div style={{
          marginTop: 36, opacity: bannerOp, transform: `scale(${bannerScale})`,
          background: COLORS.accent, color: "#101502",
          fontFamily: INTER, fontWeight: 900, fontStyle: "italic", fontSize: 32,
          padding: "18px 44px",
          clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)",
          boxShadow: `0 12px 50px ${COLORS.accent}35`,
        }}>
          2-of-3 SIGNATURES → POT RELEASED ON-CHAIN
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
