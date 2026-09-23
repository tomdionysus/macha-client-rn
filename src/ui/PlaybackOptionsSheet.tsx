import React, { useEffect } from 'react';
import { Text } from 'react-native';
import type { PlaybackSession, PlaybackStreamInfo, PlaybackTransform } from '../api/playback';
import { deviceCapabilities, devicePlaybackOverrides } from '../playback/capabilities';
import { directUnavailableReason, remuxUnavailableReason } from '../playback/policy';
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
 * In-session playback controls.
 *
 * The node's `options` decide which modes, qualities, audio tracks, subtitle
 * tracks and media representations exist. What this device can actually play
 * is decided here, from its own decoders: Remux and Direct stay listed but are
 * disabled, with the reason, when they would hand the player something it
 * cannot decode (Tom, 2026-09-23 and 2026-09-24). A mode is never hidden —
 * the viewer sees what exists and why it is not available to them.
 */
export function PlaybackOptionsSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const { session, applyUpdate, busy } = usePlayback();
  const remuxBlocked = session ? remuxUnavailableReason(session, deviceCapabilities(), devicePlaybackOverrides()) : undefined;
  const directBlocked = session ? directUnavailableReason(session, deviceCapabilities(), devicePlaybackOverrides()) : undefined;

  // What the server said about the video, beside the verdict. An unreported
  // bit depth is not an objection, so a ten-bit source the node could not
  // probe is still offered — and only this line tells the two cases apart.
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

  return (
    <Sheet visible={visible} title="Playback" onClose={onClose}>
      <SheetSection title="Mode">
        {/*
          * No Auto. The server no longer chooses: `mode` is required and it
          * performs exactly what it is told, so the default comes from the
          * shared chooser and these are overrides on top of it.
          */}
        {(options.modes as PlaybackMode[]).map((mode) => {
          // Kept in the list and explained, not hidden: Tom's calls, Remux
          // 2026-09-23 and Direct 2026-09-24. Either, on video or a file this
          // device cannot handle, is a decoder refusal the menu had offered.
          const blocked = mode === 'remux' ? remuxBlocked : mode === 'direct' ? directBlocked : undefined;
          const unavailable = mode !== preferences.mode ? blocked : undefined;
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
              disabled={busy || unavailable !== undefined}
              onPress={() => change({ preferences: { mode } })}
            />
          );
        })}
      </SheetSection>

      {options.canChangeQuality && options.qualityHeights.length > 0 ? (
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

      {options.canSwitchMedia && options.mediaIds.length > 1 ? (
        <SheetSection title="Version">
          {options.mediaIds.map((mediaId) => (
            <SheetOption
              key={mediaId}
              label={shortMediaId(mediaId)}
              selected={session.mediaId === mediaId}
              disabled={busy}
              onPress={() => change({ mediaId })}
            />
          ))}
        </SheetSection>
      ) : null}

      <SheetSection title={endpointLabel(session) ?? 'Source'}>
        <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 18 }}>
          {[
            session.sourceInfo.format?.toUpperCase(),
            formatBitrate(session.sourceInfo.bitrate),
            // The container the node says it is serving, which is the honest
            // answer; `format` is the muxer's own name for it and only stands
            // in for a node that does not report the container.
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
 * What the node actually resolved, per elementary stream. Mixed results —
 * video copied while audio is transcoded — are real and worth showing, even
 * though the preference schema has no way to ask for them directly.
 *
 * Nothing to add when no stream is transcoded, though. A direct session
 * copies no stream anywhere — it serves the source file untouched — and a
 * remux rewraps both together, so "video copy, audio copy" names an operation
 * per stream that only happened to the session as a whole. The mode already
 * says that much, and spending "copy" on it is what stops the word meaning
 * anything in the case that needs it: one stream copied while its sibling is
 * re-encoded. Matches how `describePlaybackSession` badges the same sessions
 * in @machafoundation/core.
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

/** A `macha:` identity is a hash; the tail is the only part that distinguishes versions on screen. */
function shortMediaId(mediaId: string): string {
  const body = mediaId.replace(/^macha:/, '');
  return body.length > 16 ? `…${body.slice(-12)}` : body;
}

/**
 * Which node is serving this, as the section heading.
 *
 * The stream description underneath says what is being served; naming the
 * endpoint says where it is coming from, which is the thing you actually want
 * when a cluster has more than one node and one of them is behaving oddly.
 *
 * The scheme is dropped because `SheetSection` uppercases its title and
 * `HTTP://` is noise in a heading whose whole job is to identify a host. A
 * session that names no endpoint keeps the generic heading rather than showing
 * an empty one.
 */
function endpointLabel(session: PlaybackSession): string | undefined {
  const base = session.endpoint?.baseUrl?.trim();
  if (!base) return undefined;
  return base.replace(/^https?:\/\//i, '') || undefined;
}

/** What is actually coming down the wire, preferred over the muxer's name for it. */
function outputContainer(session: PlaybackSession): string | undefined {
  return session.output.container ?? session.output.format;
}
