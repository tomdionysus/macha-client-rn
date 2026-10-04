import type { ConnectionCheckResult } from '@machafoundation/core';
import { SERVER_UNREACHABLE_MESSAGE } from '../api/errors';

// The node list is edited as one row per address, because a URL keyboard's Go
// key cannot insert a newline. A pasted list is split across rows.

/** Whitespace, newlines, commas and semicolons. No address contains any of them. */
const SEPARATORS = /[\s,;]+/;

/** The addresses in a blob of text, in order, with the empties dropped. */
export function splitEndpointEntries(text: string): string[] {
  return text.split(SEPARATORS).map((entry) => entry.trim()).filter(Boolean);
}

/** Rows are never empty: an empty list is one empty row, so there is always something to type into. */
export function normalizeRows(rows: readonly string[]): string[] {
  return rows.length > 0 ? [...rows] : [''];
}

/** One row edited. A value with separators is a paste and expands to a row each; otherwise it replaces the row, even if empty. */
export function editRow(rows: readonly string[], index: number, value: string): string[] {
  const next = normalizeRows(rows);
  if (index < 0 || index >= next.length) return next;

  if (!SEPARATORS.test(value)) {
    next[index] = value;
    return next;
  }

  const parts = splitEndpointEntries(value);
  // A paste of only separators leaves the row as it was.
  if (parts.length === 0) return next;
  next.splice(index, 1, ...parts);
  return next;
}

/** A row removed. Removing the last one leaves an empty row rather than no field at all. */
export function removeRow(rows: readonly string[], index: number): string[] {
  const next = normalizeRows(rows);
  if (index < 0 || index >= next.length) return next;
  next.splice(index, 1);
  return normalizeRows(next);
}

/** A row added at the end, unless the last one is still empty and waiting to be typed into. */
export function addRow(rows: readonly string[]): string[] {
  const next = normalizeRows(rows);
  return next[next.length - 1]?.trim() === '' ? next : [...next, ''];
}

/** A scanned address: fills the first empty row, else appends; never duplicates. */
export function adoptEndpoint(rows: readonly string[], endpoint: string): string[] {
  const next = normalizeRows(rows);
  if (next.some((row) => row.trim() === endpoint)) return next;
  const empty = next.findIndex((row) => row.trim() === '');
  if (empty >= 0) next[empty] = endpoint;
  else next.push(endpoint);
  return next;
}

/** What the connect screen does once core has checked the addresses. */
export type ConnectOutcome =
  | { kind: 'save'; endpoints: string[] }
  | { kind: 'refuse'; message: string }
  /** Only reached, never confirmed as Macha: say so, and save on a second tap. */
  | { kind: 'confirm'; message: string };

/**
 * Turns core's `checkEndpointConfiguration` result into what the screen does.
 * Every address is saved (a node down now is still in the cluster), ordered:
 * confirmed Macha, then merely answered, then the rest. `acknowledged` means
 * the viewer already saw the "did not identify itself" warning.
 */
export function connectOutcome(result: ConnectionCheckResult, acknowledged: boolean): ConnectOutcome {
  if (result.problem === 'no-endpoints') return { kind: 'refuse', message: NO_ENDPOINT_MESSAGE };
  if (result.problem === 'pending') {
    return {
      kind: 'refuse',
      message: 'No node has answered yet. It may still be starting, or the address may be wrong. Try again in a moment.',
    };
  }
  if (result.problem === 'unreachable' || result.available.length === 0) return { kind: 'refuse', message: SERVER_UNREACHABLE_MESSAGE };

  const unconfirmed = new Set(result.unconfirmed);
  const confirmed = result.available.filter((endpoint) => !unconfirmed.has(endpoint));
  if (confirmed.length === 0 && !acknowledged) {
    return {
      kind: 'confirm',
      message:
        'Something answered at that address, but it did not identify itself as a Macha node. Check the address and port, or tap Connect again to use it anyway.',
    };
  }
  const answered = [...confirmed, ...result.available.filter((endpoint) => unconfirmed.has(endpoint))];
  return { kind: 'save', endpoints: [...answered, ...result.endpoints.filter((endpoint) => !answered.includes(endpoint))] };
}

export const NO_ENDPOINT_MESSAGE = 'Enter the address of a Macha node, for example 192.168.1.20:7438';
