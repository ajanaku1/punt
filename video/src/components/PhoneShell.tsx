import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, OffthreadVideo, staticFile } from "remotion";
import { COLORS } from "../constants";
import { INTER } from "../fonts";

/** A phone bezel wrapping one of the real app recordings. */
export const PhoneShell: React.FC<{
  src: string;
  label?: string;
  delay?: number;
  startFrom?: number;
  height?: number;
  style?: React.CSSProperties;
}> = ({ src, label, delay = 0, startFrom = 0, height = 880, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const width = height / 2;
  const prog = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 100 } });
  const opacity = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(prog, [0, 1], [0.95, 1]);

  return (
    <div style={{ opacity, transform: `scale(${scale})`, ...style }}>
      {label ? (
        <div style={{
          fontFamily: INTER, fontSize: 20, fontWeight: 700, letterSpacing: "0.12em",
          color: COLORS.muted, textTransform: "uppercase", textAlign: "center", marginBottom: 14,
        }}>
          {label}
        </div>
      ) : null}
      <div style={{
        width: width + 24, height: height + 24, borderRadius: 44,
        background: "#131824", border: "1px solid #232b3b",
        boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 60px ${COLORS.accent}12`,
        padding: 12, overflow: "hidden",
      }}>
        <div style={{ width, height, borderRadius: 34, overflow: "hidden", background: COLORS.bg }}>
          {frame >= delay && (
            <OffthreadVideo
              src={staticFile(src)}
              startFrom={startFrom}
              style={{ width, height, objectFit: "cover" }}
              muted
            />
          )}
        </div>
      </div>
    </div>
  );
};
