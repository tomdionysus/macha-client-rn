import type { ConnectionCheckResult } from '@machafoundation/core';
import { SERVER_UNREACHABLE_MESSAGE } from '../api/errors';

/**
 * The node list as rows, because a newline could not be typed.
 *
 * The connect screen used to be one multiline box: several nodes, one per
 * line. The field accepted that and the parser accepted it, but on a phone the
 * second line was unreachable — a URL keyboard's action key is Go, and neither
 * `multiline` nor `submitBehavior="newline"` persuaded it to insert a line
 * break instead of submitting. That was tried, shipped in 0.4.0 and measured
 * on a device: still one line.
 *
 * So the list stopped depending on a key that may not exist. Each node gets a
 * row of its own and a control adds another. Pasting a list still works, and
 * is the one case that needs parsing: what arrives in a single row may be a
 * whole list, and it gets split across rows rather than left as text no
 * separator in this app would later split.
 */

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

/**
 * One row edited.
 *
 * A value carrying separators is a paste of several addresses, and it expands
 * into a row each. Typing is the ordinary case and replaces the row as given —
 * including leaving it empty, because a half-deleted row is still a row
 * somebody is working in.
 */
export function editRow(rows: readonly string[], index: number, value: string): string[] {
  const next = normalizeRows(rows);
  if (index < 0 || index >= next.length) return next;

  if (!SEPARATORS.test(value)) {
    next[index] = value;
    return next;
  }

  const parts = splitEndpointEntries(value);
  // A paste of nothing but separators leaves the row as it was rather than
  // deleting it, which is what someone who pasted by accident expects.
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

/**
 * An address adopted from somewhere other than the keyboard — a scanned code.
 *
 * It fills the first empty row rather than appending, because a fresh screen
 * is one empty row and appending to it would leave a blank above the thing the
 * viewer just scanned. An address already in the list is not added twice.
 */
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
 *
 * Every address is saved, not only those that answered: a node that is down
 * tonight is still in the cluster. Those that answered as Macha go first so
 * the first request starts on one known to answer, then those that merely
 * answered, then the rest.
 *
 * `acknowledged` is the viewer having already seen the "did not identify
 * itself" warning for these same addresses.
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
