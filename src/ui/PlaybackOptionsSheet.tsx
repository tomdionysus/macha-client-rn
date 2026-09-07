import React from 'react';
import { Text } from 'react-native';
import type { PlaybackSession, PlaybackStreamInfo } from '../api/playback';
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
 * Availability is never derived locally: the node's `options` decide which
 * qualities, audio tracks, subtitle tracks and media representations exist.
 * Direct is the one exception — it is offered as an explicit override even
 * when capability negotiation left it out, because a viewer who knows their
 * device can play a file should be able to say so.
 */
export function PlaybackOptionsSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const { session, applyUpdate, busy } = usePlayback();

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
        {(options.modes as PlaybackMode[]).map((mode) => (
          <SheetOption
            key={mode}
            label={MODE_LABELS[mode]}
            detail={mode === preferences.mode ? `Now: ${session.mode} · ${describeTransform(session)}` : MODE_DETAIL[mode]}
            selected={preferences.mode === mode}
            disabled={busy}
            onPress={() => change({ preferences: { mode } })}
          />
        ))}
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

      <SheetSection title="Source">
        <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 18 }}>
          {[
            session.sourceInfo.format?.toUpperCase(),
            formatBitrate(session.sourceInfo.bitrate),
            session.output.format ? `→ ${session.output.format.toUpperCase()}` : undefined,
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
 */
function describeTransform(session: PlaybackSession): string {
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
