import { describe, expect, it } from 'vitest';
import type { PlaybackStartProgress } from '@machafoundation/core';
import { preparingStreamText, startProgressText, startWaitNotice } from './startProgress';

// The web client's cases; every client says the same.

const progress = (overrides: Partial<PlaybackStartProgress>): PlaybackStartProgress => ({
  kind: 'start', stage: 'planning', progressSeq: 1, elapsedMs: 0, ...overrides,
});

describe('what a start or a change is doing (server 0.69.0)', () => {
  it('names the stage of a start, and the node only while it is planning', () => {
    expect(startProgressText(progress({ stage: 'planning' }), 'fi-1')).toBe('Preparing the stream on fi-1');
    expect(startProgressText(progress({ stage: 'preroll', prerollDecodedMs: 2_000, prerollTotalMs: 5_000 }), 'fi-1'))
      .toBe('Finding the start point: 40%');
    expect(startProgressText(progress({ stage: 'encoding', outputMediaMs: 1_200, firstFragmentMs: 2_000 }), 'fi-1'))
      .toBe('Starting the stream: 60%');
  });

  it('names the node throughout a change, since another stream is playing meanwhile', () => {
    expect(startProgressText(progress({ kind: 'change', stage: 'planning' }), 'fi-1', true)).toBe('Preparing new stream on fi-1…');
    expect(startProgressText(progress({ kind: 'change', stage: 'preroll', prerollDecodedMs: 1, prerollTotalMs: 4 }), 'fi-1', true))
      .toBe('Finding the start point on fi-1: 25%');
    expect(startProgressText(progress({ kind: 'change', stage: 'encoding', outputMediaMs: 0, firstFragmentMs: 2_000 }), 'fi-1', true))
      .toBe('Starting the new stream on fi-1: 0%');
  });

  it('shows no figure the node did not measure, rather than a zero or a guess', () => {
    expect(startProgressText(progress({ stage: 'encoding', firstFragmentMs: 2_000 }))).toBe('Starting the stream');
    expect(startProgressText(progress({ stage: 'preroll', prerollDecodedMs: 3_000, prerollTotalMs: 0 }))).toBe('Finding the start point');
    expect(startProgressText(progress({ kind: 'change', stage: 'encoding' }), undefined, true)).toBe('Starting the new stream…');
  });

  it('says nothing once the start is over, whichever way it ended', () => {
    expect(startProgressText(progress({ stage: 'ready' }))).toBeUndefined();
    expect(startProgressText(progress({ stage: 'failed' }))).toBeUndefined();
  });
});

describe('what to tell a viewer whose title has not started yet', () => {
  it('says nothing while a start is still ordinary', () => {
    expect(startWaitNotice(true, 0)).toBeUndefined();
    expect(startWaitNotice(true, 4_999)).toBeUndefined();
  });

  it('names what is being waited for, and how long it has been', () => {
    expect(startWaitNotice(true, 5_000)).toBe('Waiting for the node to start the stream (5s)');
    expect(startWaitNotice(true, 12_400)).toBe('Waiting for the node to start the stream (12s)');
  });

  it('says nothing about a rebuffer', () => {
    expect(startWaitNotice(false, 30_000)).toBeUndefined();
  });

  it('says what the node reports it is doing, when it reports that, after the same delay', () => {
    expect(startWaitNotice(true, 4_999, 'Starting the stream: 60%')).toBeUndefined();
    expect(startWaitNotice(true, 9_200, 'Starting the stream: 60%')).toBe('Starting the stream: 60% (9s)');
  });
});

describe('the line while a new stream is built behind the playing one', () => {
  it('names the serving node for a change, with or without progress', () => {
    expect(preparingStreamText(undefined, 'Corvus FI-1')).toBe('Preparing new stream on Corvus FI-1…');
    expect(preparingStreamText(progress({ kind: 'change', stage: 'encoding', outputMediaMs: 300, firstFragmentMs: 1_000 }), 'Corvus FI-1'))
      .toBe('Starting the new stream on Corvus FI-1: 30%');
  });

  it('words a failover, which arrives as a start, as a new stream on no node', () => {
    expect(preparingStreamText(progress({ stage: 'planning' }), 'Corvus FI-1')).toBe('Preparing new stream…');
    expect(preparingStreamText(progress({ stage: 'preroll', prerollDecodedMs: 1, prerollTotalMs: 2 }), 'Corvus FI-1'))
      .toBe('Finding the start point: 50%');
    expect(preparingStreamText(progress({ stage: 'encoding' }), 'Corvus FI-1')).toBe('Starting the new stream…');
  });
});
