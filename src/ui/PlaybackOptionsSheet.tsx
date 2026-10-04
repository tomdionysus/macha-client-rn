import React, { useEffect, useSyncExternalStore } from 'react';
import { Text } from 'react-native';
import { sessionNodeName } from '../api/nodeNames';
import type { PlaybackSession, PlaybackStreamInfo, PlaybackTransform } from '../api/playback';
import { deviceCapabilities, devicePlaybackOverrides } from '../playback/capabilities';
import { directUnavailableReason, remuxUnavailableReason } from '../playback/policy';
import {
  offersVersions,
  playingStep,
  qualityChoiceText,
  qualityLabel,
  qualityPreferences,
} from '../playback/quality';
import type { VersionStep } from '@machafoundation/core';
import { usePlayback } from '../providers/PlaybackProvider';
import type { PlaybackMode } from '../types';
import { Sheet, SheetOption, SheetSection } from './Sheet';
import { describeStream, formatBitrate, formatChannels, formatLanguage } from './format';
import { colors, space, type as typography } from './theme';

const MODE_LABELS: Record<PlaybackMode, string> = {
  direct: 'Direct play',
  remux: 'Remux',
  transcode: 'Transcode',
};

const MODE_DETAIL: Record<PlaybackMode, string> = {
  direct: 'Send the original file untouched. Fastest, if the device can play it.',
  remux: 'Repackage the original streams. No quality loss.',
  transcode: 'Re-encode on the node. Works with anything, costs the most.',
};

/**
 * In-session playback controls. The node's `options` say what exists; this
 * device's decoders decide what is enabled. Undecodable Remux and Direct stay
 * listed with the reason, and "Offer everything" lets the viewer pick them anyway.
 */
export function PlaybackOptionsSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const { session, applyUpdate, playVersion, versions, busy } = usePlayback();
  const everything = useSyncExternalStore(qualityPreferences.subscribe, qualityPreferences.getSnapshot).offerAll === true;
  const remuxBlocked = session ? remuxUnavailableReason(session, deviceCapabilities(), devicePlaybackOverrides()) : undefined;
  const directBlocked = session ? directUnavailableReason(session, deviceCapabilities(), devicePlaybackOverrides()) : undefined;

  // Logs source facts beside the verdict. An unreported bit depth is not an
  // objection, so only this log reveals an unprobed ten-bit source.
  const sourceVideo = session?.sourceInfo.streams.find((stream) => stream.index === session.selected.videoStream);
  useEffect(() => {
    if (!visible || !session) return;
    console.log('[macha] [playback] mode-availability', {
      codec: sourceVideo?.codec,
      profile: sourceVideo?.profile,
      bitDepth: sourceVideo?.bitDepth,
      container: session.sourceInfo.container ?? session.sourceInfo.format,
      remux: remuxBlocked ?? 'available',
      direct: directBlocked ?? 'available',
    });
  }, [visible, session, sourceVideo, remuxBlocked, directBlocked]);

  if (!session) return null;

  const { options, preferences, selected } = session;

  const change = (update: Parameters<typeof applyUpdate>[0]) => {
    void applyUpdate(update);
    onClose();
  };

  const pick = (step: VersionStep) => {
    void playVersion(step);
    onClose();
  };

  // The item's qualities (as on the detail screen) replace the node's height
  // list, which remains only when the facts never arrived.
  const shownVersions = offersVersions(versions) ? versions : undefined;
  const choiceText = shownVersions ? qualityChoiceText(shownVersions) : undefined;
  const playing = shownVersions ? playingStep(shownVersions.steps, session) : undefined;

  return (
    <Sheet visible={visible} title="Playback" onClose={onClose}>
      <SheetSection title="Mode">
        {/* No Auto: the server requires `mode`; the default comes from the shared chooser. */}
        {(options.modes as PlaybackMode[]).map((mode) => {
          const blocked = mode === 'remux' ? remuxBlocked : mode === 'direct' ? directBlocked : undefined;
          const unavailable = mode !== preferences.mode ? blocked : undefined;
          // "Offer everything" unlocks it; the reason stays shown.
          const locked = unavailable !== undefined && !everything;
          return (
            <SheetOption
              key={mode}
              label={MODE_LABELS[mode]}
              detail={
                mode === preferences.mode
                  ? [`Now: ${session.mode}`, describeTransform(session)].filter(Boolean).join(' · ')
                  : (unavailable ?? MODE_DETAIL[mode])
              }
              selected={preferences.mode === mode}
              disabled={busy || locked}
              onPress={() => change({ preferences: { mode } })}
            />
          );
        })}
      </SheetSection>

      {shownVersions ? (
        <SheetSection title="Quality">
          {shownVersions.steps.map((step) => (
            <SheetOption
              key={`${step.quality}-${step.mediaId ?? ''}`}
              label={qualityLabel(step.quality)}
              detail={stepDetail(step)}
              selected={playing === step}
              disabled={busy}
              onPress={() => pick(step)}
            />
          ))}
          {choiceText && !playing ? (
            <Text style={{ ...typography.caption, color: colors.textFaint, marginBottom: space.md }}>
              {choiceText}
            </Text>
          ) : null}
        </SheetSection>
      ) : options.canChangeQuality && options.qualityHeights.length > 0 ? (
        <SheetSection title="Quality">
          <SheetOption
            label="Original"
            detail="No height limit."
            selected={preferences.maxHeight === null}
            disabled={busy}
            onPress={() => change({ preferences: { maxHeight: null } })}
          />
          {options.qualityHeights.map((height) => (
            <SheetOption
              key={height}
              label={`${height}p`}
              selected={preferences.maxHeight === height}
              disabled={busy}
              onPress={() => change({ preferences: { maxHeight: height } })}
            />
          ))}
        </SheetSection>
      ) : null}

      {options.audioStreams.length > 0 ? (
        <SheetSection title="Audio">
          {options.audioStreams.map((stream) => (
            <SheetOption
              key={stream.index}
              label={streamLabel(stream)}
              detail={describeStream(stream) || undefined}
              selected={selected.audioStream === stream.index}
              disabled={busy}
              onPress={() => change({ preferences: { audioStream: stream.index } })}
            />
          ))}
        </SheetSection>
      ) : null}

      <SheetSection title="Subtitles">
        <SheetOption
          label="Off"
          selected={selected.subtitleStream < 0}
          disabled={busy}
          onPress={() => change({ preferences: { subtitleStream: -1 } })}
        />
        {options.subtitleStreams.map((stream) => (
          <SheetOption
            key={stream.index}
            label={streamLabel(stream)}
            detail={stream.forced ? 'Forced' : stream.codec?.toUpperCase()}
            selected={selected.subtitleStream === stream.index}
            disabled={busy}
            onPress={() => change({ preferences: { subtitleStream: stream.index } })}
          />
        ))}
        {options.subtitleStreams.length === 0 ? (
          <Text style={{ ...typography.caption, color: colors.textFaint, marginBottom: space.md }}>
            This item has no subtitle tracks.
          </Text>
        ) : null}
      </SheetSection>

      {/* The serving node, and what it serves. */}
      <SheetSection title={sessionNodeName(session) ?? 'Source'}>
        <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 18 }}>
          {[
            session.sourceInfo.format?.toUpperCase(),
            formatBitrate(session.sourceInfo.bitrate),
            outputContainer(session) ? `→ ${outputContainer(session)!.toUpperCase()}` : undefined,
            formatBitrate(session.output.bitrate),
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>
      </SheetSection>
    </Sheet>
  );
}

/**
 * Per-stream transforms, shown only when something is transcoded (e.g. video
 * copied, audio transcoded); otherwise the mode says it all. Matches core's
 * `describePlaybackSession`.
 */
function describeTransform(session: PlaybackSession): string | undefined {
  const untouched = (transform: PlaybackTransform) => transform === 'copy' || transform === 'omit';
  if (untouched(session.transform.video) && untouched(session.transform.audio)) return undefined;
  return `video ${session.transform.video}, audio ${session.transform.audio}`;
}

function streamLabel(stream: PlaybackStreamInfo): string {
  const language = formatLanguage(stream.language);
  const channels = formatChannels(stream.channels);
  const parts = [language, channels].filter(Boolean);
  return stream.default ? `${parts.join(' · ')} (default)` : parts.join(' · ') || `Track ${stream.index}`;
}

/** How a quality would be played: its own file and how, or a transcode down. */
function stepDetail(step: VersionStep): string {
  if (step.source === 'transcode') return 'Transcoded down from a larger file';
  return `Its own file · ${MODE_LABELS[step.instruction.mode]}`;
}

/** The served container; the muxer `format` is only a fallback. */
function outputContainer(session: PlaybackSession): string | undefined {
  return session.output.container ?? session.output.format;
}
