import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, TERMINAL } from "../constants";
import { MONO } from "../fonts";

type LineColor = "prompt" | "text" | "green" | "yellow" | "red" | "blue" | "purple";

export const Terminal: React.FC<{
  lines: { text: string; color: LineColor }[];
  title?: string; charsPerFrame?: number;
  delay?: number; style?: React.CSSProperties;
  width?: number;
}> = ({ lines, title = "punt — jury", charsPerFrame = 1.6, delay = 0, style, width = 1500 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const adjusted = Math.max(0, frame - delay);
  const visibleChars = Math.floor(adjusted * charsPerFrame);

  const prog = spring({ frame: adjusted, fps, config: { damping: 20, stiffness: 120 } });
  const opacity = interpolate(prog, [0, 0.3], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(prog, [0, 1], [0.96, 1]);

  const colorMap: Record<LineColor, string> = {
    prompt: TERMINAL.prompt, text: TERMINAL.text, green: TERMINAL.green,
    yellow: TERMINAL.yellow, red: TERMINAL.red, blue: TERMINAL.blue, purple: TERMINAL.purple,
  };

  let charCount = 0;
  return (
    <div style={{
      width, minHeight: 420, background: TERMINAL.bg,
      borderRadius: 12, border: `1px solid ${COLORS.border}`,
      boxShadow: `0 0 40px ${COLORS.accent}15`,
      overflow: "hidden", opacity, transform: `scale(${scale})`, ...style,
    }}>
      <div style={{ padding: "12px 16px", display: "flex", gap: 8, borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ef4444" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#f59e0b" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#22c55e" }} />
        <span style={{ fontFamily: MONO, fontSize: 13, color: TERMINAL.prompt, marginLeft: 8 }}>{title}</span>
      </div>
      <div style={{ padding: "18px 22px" }}>
        {lines.map((line, i) => {
          const start = charCount;
          charCount += line.text.length;
          if (start >= visibleChars) return null;
          const visible = Math.min(line.text.length, visibleChars - start);
          const typing = visible < line.text.length && visible > 0;
          return (
            <div key={i} style={{
              fontFamily: MONO, fontSize: 17, lineHeight: 1.75,
              color: colorMap[line.color], whiteSpace: "pre-wrap",
            }}>
              {line.text.slice(0, visible)}
              {typing && <span style={{ opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0, color: COLORS.accent }}>_</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
