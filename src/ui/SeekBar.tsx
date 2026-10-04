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

/** The bar thickens while scrubbed. */
const TRACK_HEIGHT = 4;
const ACTIVE_TRACK_HEIGHT = 7;
const THUMB_SIZE = 15;
/** Touch strip height, well beyond the drawn bar. */
const HIT_HEIGHT = 34;

/**
 * Scrubber that seeks once, on release; dragging only moves the preview, since
 * continuous seeks would renegotiate a transformed stream on every pixel.
 */
export function SeekBar({ positionMs, durationMs, bufferedMs, enabled = true, onSeek }: Props) {
  const [width, setWidth] = useState(0);
  const [scrubMs, setScrubMs] = useState<number | undefined>(undefined);
  // Props are read through refs so the PanResponder is created once: position
  // updates re-render several times a second, and a responder rebuilt mid-drag
  // resets `dx` and snaps the thumb back.
  const widthRef = useRef(0);
  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  /** Where the finger first landed; the drag is measured from here. */
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
        // locationX is only reliable at grant; mid-drag it may be relative to a child view.
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
    // Created once: see the refs above.
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
