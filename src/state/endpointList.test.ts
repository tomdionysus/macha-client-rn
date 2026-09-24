import { describe, expect, it } from 'vitest';
import { addRow, adoptEndpoint, connectOutcome, editRow, removeRow, splitEndpointEntries } from './endpointList';

describe('splitEndpointEntries', () => {
  it('takes a list however it was separated', () => {
    expect(splitEndpointEntries('10.0.0.1:7438\n10.0.0.2:7438')).toEqual(['10.0.0.1:7438', '10.0.0.2:7438']);
    expect(splitEndpointEntries('10.0.0.1:7438, 10.0.0.2:7438')).toEqual(['10.0.0.1:7438', '10.0.0.2:7438']);
    expect(splitEndpointEntries('  10.0.0.1:7438  ')).toEqual(['10.0.0.1:7438']);
    expect(splitEndpointEntries('   ')).toEqual([]);
  });
});

describe('editRow', () => {
  it('replaces the row as typed, empty included', () => {
    expect(editRow(['a', 'b'], 0, 'c')).toEqual(['c', 'b']);
    expect(editRow(['a', 'b'], 1, '')).toEqual(['a', '']);
  });

  // The whole reason rows exist: a pasted list has to land as a list, or the
  // viewer is back to a row holding text nothing will ever split again.
  it('expands a pasted list across rows', () => {
    expect(editRow([''], 0, '10.0.0.1:7438\n10.0.0.2:7438')).toEqual(['10.0.0.1:7438', '10.0.0.2:7438']);
    expect(editRow(['keep', ''], 1, 'a, b')).toEqual(['keep', 'a', 'b']);
  });

  it('leaves a row alone when the paste was only separators', () => {
    expect(editRow(['a'], 0, '   ')).toEqual(['a']);
  });

  it('ignores an index that is not there', () => {
    expect(editRow(['a'], 3, 'b')).toEqual(['a']);
  });
});

describe('removeRow and addRow', () => {
  it('always leaves something to type into', () => {
    expect(removeRow(['only'], 0)).toEqual(['']);
    expect(removeRow(['a', 'b'], 0)).toEqual(['b']);
  });

  it('does not stack empty rows', () => {
    expect(addRow(['a'])).toEqual(['a', '']);
    expect(addRow(['a', ''])).toEqual(['a', '']);
    expect(addRow([])).toEqual(['']);
  });
});

describe('adoptEndpoint', () => {
  it('fills the empty row a fresh screen starts with', () => {
    expect(adoptEndpoint([''], 'http://10.0.0.1:7438')).toEqual(['http://10.0.0.1:7438']);
  });

  it('appends when every row is spoken for, and never duplicates', () => {
    expect(adoptEndpoint(['http://a:7438'], 'http://b:7438')).toEqual(['http://a:7438', 'http://b:7438']);
    expect(adoptEndpoint(['http://a:7438'], 'http://a:7438')).toEqual(['http://a:7438']);
  });
});

/**
 * What the connect screen does with core's `checkEndpointConfiguration`.
 *
 * It replaced a local `firstReachable` that asked the same route but could
 * not tell "still waiting" from "nothing there", and accepted anything that
 * answered 401/403/404/503 without saying it might not be Macha.
 */
describe('connectOutcome', () => {
  const base = { endpoints: ['http://a:7438', 'http://b:7438', 'http://c:7438'], available: [], unconfirmed: [] };

  it('saves every address, those that answered as Macha first', () => {
    const outcome = connectOutcome({ ...base, available: ['http://c:7438', 'http://b:7438'], unconfirmed: ['http://b:7438'] }, false);
    expect(outcome).toEqual({ kind: 'save', endpoints: ['http://c:7438', 'http://b:7438', 'http://a:7438'] });
  });

  // A mistyped router address answers too. Say so rather than silently
  // accepting it — or refusing it, since a node behind a proxy may look the same.
  it('asks before saving when nothing identified itself as Macha', () => {
    const result = { ...base, available: ['http://b:7438'], unconfirmed: ['http://b:7438'] };
    const first = connectOutcome(result, false);
    expect(first.kind).toBe('confirm');
    expect(first.kind === 'confirm' && first.message).toMatch(/did not identify itself as a Macha node/);
    expect(connectOutcome(result, true)).toEqual({ kind: 'save', endpoints: ['http://b:7438', 'http://a:7438', 'http://c:7438'] });
  });

  it('tells a slow node from an absent one', () => {
    const pending = connectOutcome({ ...base, problem: 'pending' }, false);
    const unreachable = connectOutcome({ ...base, problem: 'unreachable' }, false);
    expect(pending.kind).toBe('refuse');
    expect(unreachable.kind).toBe('refuse');
    expect(pending).not.toEqual(unreachable);
    expect(pending.kind === 'refuse' && pending.message).toMatch(/No node has answered yet/);
  });
});
