import React from "react";
import { AbsoluteFill, Audio, interpolate, staticFile } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { COLORS, FPS, CROSSFADE, AUDIO_DURATIONS, SCENE_DURATIONS, AUDIO_FILES } from "./constants";
import { Subtitles } from "./Subtitles";
import { Hook } from "./scenes/Hook";
import { NoServer } from "./scenes/NoServer";
import { Composer } from "./scenes/Composer";
import { Swipe } from "./scenes/Swipe";
import { Jury } from "./scenes/Jury";
import { Close } from "./scenes/Close";

const SceneAudio: React.FC<{ src: string; audioDuration: number }> = ({ src, audioDuration }) => (
  <Audio
    src={staticFile(src)}
    volume={(f) => {
      const fadeIn = interpolate(f, [0, Math.round(FPS * 0.3)], [0, 1], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      });
      const fadeOut = interpolate(f, [audioDuration - FPS, audioDuration], [1, 0], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      });
      return Math.min(fadeIn, fadeOut);
    }}
  />
);

const scenes = [
  { id: "hook" as const, Component: Hook },
  { id: "noserver" as const, Component: NoServer },
  { id: "composer" as const, Component: Composer },
  { id: "swipe" as const, Component: Swipe },
  { id: "jury" as const, Component: Jury },
  { id: "close" as const, Component: Close },
];

export const MainVideo: React.FC = () => {
  const transition = linearTiming({ durationInFrames: CROSSFADE });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <TransitionSeries>
        {scenes.flatMap((scene, i) => {
          const elements = [
            <TransitionSeries.Sequence key={scene.id} durationInFrames={SCENE_DURATIONS[scene.id]}>
              <scene.Component />
              <SceneAudio src={AUDIO_FILES[scene.id]} audioDuration={AUDIO_DURATIONS[scene.id]} />
            </TransitionSeries.Sequence>,
          ];
          if (i < scenes.length - 1) {
            elements.push(
              <TransitionSeries.Transition key={`t-${scene.id}`} presentation={fade()} timing={transition} />,
            );
          }
          return elements;
        })}
      </TransitionSeries>
      <Subtitles />
    </AbsoluteFill>
  );
};
