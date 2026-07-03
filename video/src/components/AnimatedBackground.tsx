import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLORS } from "../constants";

type Orb = {
  baseX: number; baseY: number; size: number;
  color: string; blur: number; opacity: number; speed: number;
};

// Broadcast: lime + cyan on studio navy
const DEFAULT_ORBS: Orb[] = [
  { baseX: 250, baseY: 200, size: 480, color: COLORS.accent, blur: 120, opacity: 0.09, speed: 0.006 },
  { baseX: 1550, baseY: 780, size: 420, color: COLORS.cyan, blur: 110, opacity: 0.08, speed: 0.005 },
  { baseX: 960, baseY: 500, size: 550, color: "#3a5bd9", blur: 140, opacity: 0.08, speed: 0.008 },
  { baseX: 1680, baseY: 160, size: 380, color: COLORS.accentDim, blur: 100, opacity: 0.07, speed: 0.007 },
  { baseX: 180, baseY: 820, size: 320, color: COLORS.accent, blur: 100, opacity: 0.05, speed: 0.009 },
];

export const AnimatedBackground: React.FC<{ orbs?: Orb[] }> = ({ orbs = DEFAULT_ORBS }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {orbs.map((orb, i) => {
        const x = orb.baseX + Math.sin(frame * orb.speed + i * 1.5) * 90;
        const y = orb.baseY + Math.cos(frame * orb.speed + i * 2.1) * 70;
        return (
          <div key={i} style={{
            position: "absolute",
            left: x - orb.size / 2,
            top: y - orb.size / 2,
            width: orb.size,
            height: orb.size,
            borderRadius: "50%",
            background: orb.color,
            filter: `blur(${orb.blur}px)`,
            opacity: orb.opacity,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};
