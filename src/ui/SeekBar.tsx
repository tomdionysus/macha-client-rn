import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { formatDuration } from './format';
import { colors, radius, space, type as typography } from './theme';

interface Props {
  positionMs: number;
  durationMs: number;
  bufferedMs: number;
  enabled?: boolean;
  onSeek(positionMs: number): void;
}

/** The bar is thin at rest and thickens under a finger, so the touch target is generous but the chrome is not. */
const TRACK_HEIGHT = 4;
const ACTIVE_TRACK_HEIGHT = 7;
const THUMB_SIZE = 15;
/** A comfortable strip to grab, well beyond the drawn bar. */
const HIT_HEIGHT = 34;

/**
 * A transactional scrubber: dragging moves only the local preview, and the
 * player is asked to seek once, on release. Seeking continuously during a drag
 * would have a transformed stream renegotiating on every pixel.
 */
export function SeekBar({ positionMs, durationMs, bufferedMs, enabled = true, onSeek }: Props) {
  const [width, setWidth] = useState(0);
  const [scrubMs, setScrubMs] = useState<number | undefined>(undefined);
  // Refs, not state: the pan handlers are created once and would otherwise
  // capture the first render's width and duration forever.
  const widthRef = useRef(0);
  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;
  // `enabled` and `onSeek` are read through refs for the same reason, and it
  // matters more than it looks: the player reports a position several times a
  // second, so anything rebuilding the handlers on a prop change rebuilds them
  // *during* a drag. `play.tsx` passes an inline arrow, so `onSeek` is a new
  // function on every one of those renders. A fresh `PanResponder` mid-gesture
  // starts a fresh gesture: `dx` resets to zero and the thumb snaps back to
  // where the finger landed, four times a second, which is what the bar
  // fighting the viewer actually was.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  /** Where the finger first landed, so the whole drag is measured from one origin. */
  const grantXRef = useRef(0);

  const displayMs = scrubMs ?? positionMs;
  const fraction = durationMs > 0 ? Math.min(1, Math.max(0, displayMs / durationMs)) : 0;
  const bufferedFraction = durationMs > 0 ? Math.min(1, Math.max(0, bufferedMs / durationMs)) : 0;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => enabledRef.current,
        onMoveShouldSetPanResponder: () => enabledRef.current,
        onPanResponderGrant: (event) => {
          grantXRef.current = event.nativeEvent.locationX;
          setScrubMs(positionAt(grantXRef.current, widthRef.current, durationRef.current));
        },
        // Only the grant location is trustworthy as an absolute x: during a
        // drag the touch may be over a child view with its own coordinates.
        // Everything after it is measured as travel from that origin.
        onPanResponderMove: (_event, gesture) => {
          setScrubMs(positionAt(grantXRef.current + gesture.dx, widthRef.current, durationRef.current));
        },
        onPanResponderRelease: (_event, gesture) => {
          const target = positionAt(grantXRef.current + gesture.dx, widthRef.current, durationRef.current);
          setScrubMs(undefined);
          onSeekRef.current(target);
        },
        onPanResponderTerminate: () => setScrubMs(undefined),
      }),
    // Created once, deliberately: see the refs above.
    [],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    widthRef.current = next;
    setWidth(next);
  };

  const scrubbing = scrubMs !== undefined;
  const height = scrubbing ? ACTIVE_TRACK_HEIGHT : TRACK_HEIGHT;

  return (
    <View>
      <View style={styles.hitArea} onLayout={onLayout} {...responder.panHandlers}>
        <View pointerEvents="none" style={[styles.track, { height, borderRadius: height / 2 }]}>
          <View
            style={[styles.buffered, { width: `${bufferedFraction * 100}%`, height, borderRadius: height / 2 }]}
          />
          <View style={[styles.played, { width: `${fraction * 100}%`, height, borderRadius: height / 2 }]} />
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              left: Math.max(0, Math.min(width, fraction * width)) - THUMB_SIZE / 2,
              width: scrubbing ? THUMB_SIZE + 4 : THUMB_SIZE,
              height: scrubbing ? THUMB_SIZE + 4 : THUMB_SIZE,
            },
          ]}
        />
      </View>
      <View style={styles.times}>
        <Text style={styles.time}>{formatDuration(displayMs)}</Text>
        <Text style={styles.time}>{durationMs > 0 ? formatDuration(durationMs) : '--:--'}</Text>
      </View>
    </View>
  );
}

function positionAt(x: number, width: number, durationMs: number): number {
  if (width <= 0 || durationMs <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, x / width)) * durationMs);
}

const styles = StyleSheet.create({
  hitArea: {
    height: HIT_HEIGHT,
    justifyContent: 'center',
  },
  track: {
    width: '100%',
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  buffered: {
    position: 'absolute',
    left: 0,
    backgroundColor: colors.buffered,
  },
  played: {
    position: 'absolute',
    left: 0,
    backgroundColor: colors.progress,
  },
  thumb: {
    position: 'absolute',
    borderRadius: radius.pill,
    backgroundColor: colors.progress,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  time: {
    ...typography.caption,
    color: colors.textDim,
    fontVariant: ['tabular-nums'],
  },
});
