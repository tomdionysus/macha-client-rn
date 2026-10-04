import { describe, expect, it } from 'vitest';
import {
  playbackVersions,
  restatePreferencesClearedByMode,
  type MediaTechnicalProfile,
  type MediaTechnicalStream,
  type PlaybackCapabilities,
  type PlaybackMediaFacts,
  type PassedOverVersion,
  type PlaybackSession,
  type QualityCeiling,
  type VersionStep,
} from '@machafoundation/core';
import { automaticStart, connectionKindOf, offersVersions, playingStep, qualityChoiceText, qualityLabel, versionStart, versionUpdate } from './quality';

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
 * The node refuses a create on a multi-audio file that names no stream
 * (`choice_required`), and core's resolver then takes the node's first
 * candidate (French here, not the default English), so streams are named.
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

  /** Without the explicit `null`, a file picked after a capped step would keep the cap via the Mode-path restatement. */
  it('lifts a cap when the viewer picks a file played as it is', () => {
    const transcodedFile = { quality: 2160 as const, source: 'file' as const, mediaId: 'uhd', instruction: { mode: 'transcode' as const, video: 'transcode' as const, audio: 'transcode' as const, reasons: [], assumed: [] } };
    const capped = session({ maxHeight: 720 });
    const update = versionUpdate(transcodedFile, capped, [uhd, fhd]);
    expect(update.preferences?.maxHeight).toBeNull();
    // It survives the restatement core applies to a mode change.
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

  /** A 4K file with a default-flagged forced English track beside the full one: a file switch keeps the kind playing. */
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

/** What is offered is core's (from the screen limit, or everything with the setting); this decides only whether it is worth a button. */
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

/** Automatic play skips a picture no node transcodes at real speed, so the measured rate must reach `playbackVersions` on every start path. */
describe('the measured transcode rate', () => {
  // A phone that decodes neither file, so both convert their picture.
  const h264Only: PlaybackCapabilities = { ...phone, videoCodecs: ['h264'] };
  const av1uhd = file('av1uhd', [video('av1', 3840, 2160), audio(1, 'eng', true)]);
  const av1fhd = file('av1fhd', [video('av1', 1920, 1080), audio(1, 'eng', true)]);
  const rate = (source: { heightClass: number }) => (source.heightClass === 2160 ? 0.33 : 2);

  it('keeps automatic play off a picture no node converts fast enough', () => {
    expect(automaticStart([av1uhd, av1fhd], ['av1uhd', 'av1fhd'], h264Only, undefined, undefined)?.versions.automatic?.quality).toBe(2160);
    const start = automaticStart([av1uhd, av1fhd], ['av1uhd', 'av1fhd'], h264Only, undefined, undefined, {}, rate);
    expect(start?.versions.automatic?.quality).toBe(1080);
    expect(start?.mediaId).toBe('av1fhd');
    expect(start?.versions.passedOver?.reasons).toContain('transcode-below-real-time');
  });

  it("states it on a viewer's pick too, which it never changes", () => {
    const picked = playbackVersions([av1uhd, av1fhd], h264Only, { mediaIds: ['av1uhd', 'av1fhd'] }).steps[0]!;
    const start = versionStart(picked, [av1uhd, av1fhd], ['av1uhd', 'av1fhd'], h264Only, undefined, {}, rate);
    expect(start.mediaId).toBe('av1uhd');
    expect(start.versions.passedOver?.reasons).toContain('transcode-below-real-time');
  });
});

// The web client's cases for `qualityChoiceText`; every client says the same sentence.
describe('why Play chooses the file it does, as one sentence from every fact', () => {
  const instruction = (video: 'copy' | 'transcode', audio: 'copy' | 'transcode') =>
    ({ mode: video === 'transcode' || audio === 'transcode' ? 'transcode' : 'direct', video, audio, reasons: [], assumed: [] }) as VersionStep['instruction'];
  const versionFile = (quality: VersionStep['quality'], video: 'copy' | 'transcode' = 'copy', audio: 'copy' | 'transcode' = 'copy') =>
    ({ quality, instruction: instruction(video, audio), index: 0 });
  // The Martian: a 4K file (HEVC, TrueHD), a 1080p file (HEVC, E-AC-3) and a 720p file (H.264, AAC).
  const files = [versionFile(2160, 'copy', 'transcode'), versionFile(1080, 'copy', 'transcode'), versionFile(720)];
  const automatic = (quality: VersionStep['quality'], video: 'copy' | 'transcode' = 'copy', audio: 'copy' | 'transcode' = 'copy') =>
    ({ quality, source: 'file', mediaId: 'm', instruction: instruction(video, audio) }) as VersionStep;
  const passedOver = (quality: VersionStep['quality'], video: boolean, audio: boolean): PassedOverVersion =>
    ({ quality, converts: { video, audio }, reasons: [] });

  it('builds one sentence when a ceiling and a conversion both kept Play off a larger file', () => {
    expect(qualityChoiceText({ files, automatic: automatic(720), limitedBy: { quality: 1080, reason: 'ceiling-display' }, passedOver: passedOver(1080, false, true) }))
      .toBe('Play chooses 720p, which plays without converting. 1080p needs its audio converted, and 4K is more than this screen shows. Pick a quality to play another.');
  });

  it('names only the conversion, where no ceiling applies (the 4K television)', () => {
    expect(qualityChoiceText({ files, automatic: automatic(1080), passedOver: passedOver(2160, false, true) }))
      .toBe('Play chooses 1080p, which plays without converting. 4K needs its audio converted. Pick a quality to play another.');
    expect(qualityChoiceText({ files, automatic: automatic(1080), passedOver: passedOver(2160, true, true) }))
      .toBe('Play chooses 1080p, which plays without converting. 4K needs its video and audio converted. Pick a quality to play another.');
  });

  it('names only the ceiling, with its reason, and the largest file it kept out', () => {
    const only = (reason: QualityCeiling['reason']) => qualityChoiceText({ files, automatic: automatic(1080), limitedBy: { quality: 1080, reason } });
    expect(only('ceiling-display')).toBe('Play chooses 1080p. 4K is more than this screen shows. Pick a quality to play another.');
    expect(only('ceiling-device')).toBe('Play chooses 1080p. 4K is more than this device plays. Pick a quality to play another.');
    expect(only('ceiling-cellular')).toBe('Play chooses 1080p. 4K is more than Play uses on mobile data. Pick a quality to play another.');
    expect(only('ceiling-preference')).toBe('Play chooses 1080p. 4K is more than the most set in Settings. Pick a quality to play another.');
  });

  it("says where the conversion is not only needed but too slow for any node to keep up with (server 0.70.0's rates)", () => {
    const slow: PassedOverVersion = { quality: 2160, converts: { video: true, audio: true }, reasons: ['transcode-below-real-time'] };
    expect(qualityChoiceText({ files, automatic: automatic(1080), passedOver: slow }))
      .toBe("Play chooses 1080p, which plays without converting. 4K needs its video and audio converted, which the server can't do fast enough. Pick a quality to play another.");
  });

  it('never claims the chosen file plays as it is when it does not', () => {
    expect(qualityChoiceText({ files, automatic: automatic(1080, 'copy', 'transcode'), passedOver: passedOver(2160, true, true) }))
      .toBe('Play chooses 1080p. 4K needs its video and audio converted. Pick a quality to play another.');
  });

  it('says nothing when Play chooses the largest file there is', () => {
    expect(qualityChoiceText({ files, automatic: automatic(2160) })).toBeUndefined();
  });
});
