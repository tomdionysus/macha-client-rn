import { describe, expect, it } from 'vitest';
import {
  playbackVersions,
  restatePreferencesClearedByMode,
  type MediaTechnicalProfile,
  type MediaTechnicalStream,
  type PlaybackCapabilities,
  type PlaybackMediaFacts,
  type PlaybackSession,
} from '@machafoundation/core';
import { automaticStart, connectionKindOf, offersVersions, playingStep, qualityLabel, versionStart, versionUpdate } from './quality';

const phone: PlaybackCapabilities = {
  platform: 'android',
  videoCodecs: ['h264', 'hevc'],
  audioCodecs: ['aac'],
  containers: ['mp4'],
  hlsFmp4: true,
  dash: false,
  hdr: [],
  videoBitDepth: 8,
};

const everything = {
  direct: true,
  copyIntoFmp4: { video: true, audio: true },
  copyIntoMpegts: { video: true, audio: true },
  transcodeVideo: true,
  transcodeAudio: true,
};

function video(codec: string, width: number, height: number): MediaTechnicalStream {
  return { index: 0, type: 'video', codec, profile: 'Main', language: '', default: true, forced: false, width, height };
}

function audio(index: number, language: string, isDefault: boolean): MediaTechnicalStream {
  return { index, type: 'audio', codec: 'aac', profile: 'LC', language, default: isDefault, forced: false };
}

function file(mediaId: string, streams: MediaTechnicalStream[], durationMs = 1_000, format = 'mov,mp4,m4a,3gp,3g2,mj2'): PlaybackMediaFacts {
  const profile: MediaTechnicalProfile = { mediaId, format, durationMs, bitrate: 1_000, streams };
  return { mediaId, profile, operations: everything };
}

// A 2160p and a 1080p file of one film, the 2160p with English and French,
// in Matroska, so it remuxes: Direct names no streams, and needs none.
const uhd = file('uhd', [video('hevc', 3840, 2160), audio(1, 'fra', false), audio(2, 'eng', true)], 7_000, 'matroska,webm');
const fhd = file('fhd', [video('h264', 1920, 1080), audio(1, 'eng', true)], 6_000);

function session(overrides: Partial<PlaybackSession> & { maxHeight?: number | null; audioStream?: number }): PlaybackSession {
  const { maxHeight = null, audioStream = 2, ...rest } = overrides;
  return {
    sessionId: 's',
    mode: 'transcode',
    mediaId: 'uhd',
    preferences: { mode: 'transcode', maxHeight, maxBitrate: null, audioStream, subtitleStream: -1, audioLanguage: '', subtitleLanguage: '' },
    selected: { videoStream: 0, audioStream, subtitleStream: -1 },
    sourceInfo: { streams: [
      { index: 0, type: 'video', codec: 'hevc', language: '', default: true, forced: false },
      { index: 1, type: 'audio', codec: 'aac', language: 'fra', default: false, forced: false },
      { index: 2, type: 'audio', codec: 'aac', language: 'eng', default: true, forced: false },
    ] },
    ...rest,
  } as unknown as PlaybackSession;
}

describe('connectionKindOf', () => {
  it('names mobile data, and counts what NetInfo cannot name as Wi-Fi', () => {
    expect(connectionKindOf('cellular')).toBe('cellular');
    expect(connectionKindOf('wifi')).toBe('wifi');
    expect(connectionKindOf('ethernet')).toBe('wifi');
    expect(connectionKindOf('unknown')).toBe('unknown');
    expect(connectionKindOf(undefined)).toBe('unknown');
  });
});

/**
 * A 0.58.0 node refuses a create on a file with several audio streams that
 * names none (`choice_required`). This client used to name the file and no
 * stream, and core's resolver then answered the refusal with the node's first
 * candidate: here the French track, not the default English one.
 */
describe('automaticStart', () => {
  it('names the default audio stream of the file it plays', () => {
    const start = automaticStart([uhd, fhd], ['uhd', 'fhd'], phone, undefined, undefined, {});
    expect(start?.mediaId).toBe('uhd');
    expect(start?.instruction.mode).toBe('remux');
    expect(start?.preferences.audioStream).toBe(2);
    expect(start?.durationMs).toBe(7_000);
  });

  it('takes the file under the ceiling, and says the ceiling did it', () => {
    const start = automaticStart([uhd, fhd], ['uhd', 'fhd'], phone, undefined, { quality: 1080, reason: 'ceiling-cellular' });
    expect(start?.mediaId).toBe('fhd');
    expect(start?.versions.limitedBy?.reason).toBe('ceiling-cellular');
    expect(start?.preferences.maxHeight).toBeUndefined();
  });

  it('caps a transcode where every file is above the ceiling', () => {
    const start = automaticStart([uhd], ['uhd'], phone, undefined, { quality: 720, reason: 'ceiling-preference' });
    expect(start?.instruction.mode).toBe('transcode');
    expect(start?.preferences.maxHeight).toBe(720);
  });
});

describe('versionStart', () => {
  it('plays the file the viewer picked, whatever the ceiling would have chosen', () => {
    const steps = playbackVersions([uhd, fhd], phone, { mediaIds: ['uhd', 'fhd'] }).steps;
    const picked = steps.find((step) => step.quality === 2160)!;
    const start = versionStart(picked, [uhd, fhd], ['uhd', 'fhd'], phone, undefined);
    expect(start.mediaId).toBe('uhd');
    expect(start.durationMs).toBe(7_000);
  });
});

describe('versionUpdate', () => {
  const steps = playbackVersions([uhd, fhd], phone, { mediaIds: ['uhd', 'fhd'] }).steps;

  /**
   * A picked file is played as it is. The Mode path restates the session's
   * cap into any transcode that names none, which is right there and wrong
   * here: without the explicit `null`, a file picked after a capped step
   * keeps the cap.
   */
  it('lifts a cap when the viewer picks a file played as it is', () => {
    const transcodedFile = { quality: 2160 as const, source: 'file' as const, mediaId: 'uhd', instruction: { mode: 'transcode' as const, video: 'transcode' as const, audio: 'transcode' as const, reasons: [], assumed: [] } };
    const capped = session({ maxHeight: 720 });
    const update = versionUpdate(transcodedFile, capped, [uhd, fhd]);
    expect(update.preferences?.maxHeight).toBeNull();
    // And it survives the restating core's coordinator applies to a mode change.
    expect(restatePreferencesClearedByMode(update, capped, undefined).preferences?.maxHeight).toBeNull();
  });

  it('switches file without carrying the old file’s stream indexes', () => {
    const french = session({ audioStream: 1 });
    const hd = steps.find((step) => step.quality === 1080)!;
    const update = versionUpdate(hd, french, [uhd, fhd]);
    expect(update.mediaId).toBe('fhd');
    // The 1080p file has one audio stream, at index 1, and it is English: the
    // French preference finds nothing there, and the old file's index 1 is not carried.
    expect(update.preferences?.audioStream).toBeUndefined();
    expect(update.preferences?.mediaId).toBeUndefined();
  });

  /**
   * The Martian's 4K file carries a forced English track (foreign dialogue
   * only) flagged default beside the full one. A switch across files keeps
   * the kind that was playing (core `7a79d49`, found on the television).
   */
  it('keeps a forced subtitle track forced across files, and a full one full', () => {
    const sub = (index: number, forced: boolean, isDefault: boolean): MediaTechnicalStream =>
      ({ index, type: 'subtitle', codec: 'subrip', profile: '', language: 'eng', default: isDefault, forced });
    const target = file('subs', [video('h264', 1920, 1080), audio(1, 'eng', true), sub(2, true, true), sub(3, false, false)]);
    const playing = (subtitle: number, forced: boolean) =>
      ({
        ...session({}),
        selected: { videoStream: 0, audioStream: 2, subtitleStream: subtitle },
        sourceInfo: { streams: [
          { index: 0, type: 'video', codec: 'hevc', language: '', default: true, forced: false },
          { index: 2, type: 'audio', codec: 'aac', language: 'eng', default: true, forced: false },
          { index: 5, type: 'subtitle', codec: 'subrip', language: 'eng', default: false, forced },
        ] },
      }) as unknown as PlaybackSession;
    const step = { quality: 1080 as const, source: 'file' as const, mediaId: 'subs', instruction: { mode: 'remux' as const, video: 'copy' as const, audio: 'copy' as const, reasons: [], assumed: [] } };
    expect(versionUpdate(step, playing(5, true), [target]).preferences?.subtitleStream).toBe(2);
    expect(versionUpdate(step, playing(5, false), [target]).preferences?.subtitleStream).toBe(3);
  });

  it('keeps the file, and leaves the streams to the PATCH, on a cap of the same file', () => {
    const hd720 = steps.find((step) => step.quality === 720)!;
    const update = versionUpdate(hd720, session({ mediaId: 'fhd' }), [uhd, fhd]);
    expect(update.mediaId).toBeUndefined();
    expect(update.preferences?.maxHeight).toBe(hd720.maxHeight);
  });
});

describe('playingStep', () => {
  const steps = playbackVersions([uhd, fhd], phone, { mediaIds: ['uhd', 'fhd'] }).steps;

  it('marks the file playing uncapped', () => {
    expect(playingStep(steps, session({ mediaId: 'fhd' }))?.quality).toBe(1080);
  });

  it('marks a capped transcode by its cap', () => {
    const hd720 = steps.find((step) => step.quality === 720)!;
    expect(playingStep(steps, session({ mediaId: hd720.mediaId, maxHeight: hd720.maxHeight }))?.quality).toBe(720);
  });

  it('marks nothing when another control capped the session', () => {
    expect(playingStep(steps, session({ mediaId: 'fhd', maxHeight: 480 }))).toBeUndefined();
  });
});

/**
 * Tom, 2026-09-25: a phone cannot play 2160p, so it is not offered; a setting
 * offers everything. What is offered is core's, from the screen this phone
 * states as its limit; what is left here is whether it is worth a button.
 */
describe('offersVersions', () => {
  const screen = { ...phone, maxWidth: 2400, maxHeight: 1080 };

  it('offers nothing above the screen the phone states', () => {
    const versions = playbackVersions([uhd, fhd], screen, { mediaIds: ['uhd', 'fhd'] });
    expect(offersVersions(versions)).toBe(true);
    expect(versions.steps.map((step) => step.quality)).toEqual([1080, 720]);
  });

  it('offers everything when the viewer turned the limit off', () => {
    const versions = playbackVersions([uhd, fhd], screen, { mediaIds: ['uhd', 'fhd'], offerAll: true });
    expect(versions.steps.map((step) => step.quality)).toEqual([2160, 1440, 1080, 720]);
  });

  it('offers no lone button that does what Play does', () => {
    const small = { ...phone, maxWidth: 1280, maxHeight: 720 };
    // A 1080p file on a 720p screen: Play already takes the 720p step, the only one offered.
    const versions = playbackVersions([fhd], small, { mediaIds: ['fhd'] });
    expect(versions.steps.map((step) => step.quality)).toEqual([720]);
    expect(offersVersions(versions)).toBe(false);
    expect(offersVersions(playbackVersions([fhd], small, { mediaIds: ['fhd'], offerAll: true }))).toBe(true);
  });
});

describe('qualityLabel', () => {
  it('labels classes as the web does', () => {
    expect(qualityLabel(2160)).toBe('4K');
    expect(qualityLabel(1440)).toBe('2K');
    expect(qualityLabel(1080)).toBe('1080p');
  });
});
