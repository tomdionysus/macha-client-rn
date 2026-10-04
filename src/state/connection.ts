import * as Crypto from 'expo-crypto';
import { coerceEndpointUrl } from '../api/http';
import { clientStore, readValidatedJson, writeJson } from './storage';

const CLIENT_ID_KEY = 'macha.clientId.v1';
const ENDPOINTS_KEY = 'macha.endpoints.v1';
const DISCOVERED_KEY = 'macha.discoveredEndpoints.v1';

/** Guards against a pathological advertisement; real clusters have a handful of nodes. */
const MAX_DISCOVERED_ENDPOINTS = 16;

interface StoredEndpoints {
  version: 1;
  urls: string[];
}

function validEndpoints(value: unknown): value is StoredEndpoints {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<StoredEndpoints>;
  return record.version === 1 && Array.isArray(record.urls) && record.urls.every((url) => typeof url === 'string');
}

function normalize(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    const normalized = coerceEndpointUrl(url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/**
 * A stable per-installation identity. It scopes this device's own play queue
 * and Continue Watching entries; it is never sent to Macha and is not an
 * account.
 */
export function getClientId(): string {
  const existing = clientStore.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  clientStore.setItem(CLIENT_ID_KEY, id);
  return id;
}

/** Key prefixes of the per-client stores, each followed by the client id. */
const PER_CLIENT_PREFIXES = [
  'macha.continueWatching.v1.',
  'macha-client-progress:',
  'macha.progress.v1:',
  'macha.downloads.v1.',
  'macha.playbackQueue.v1.',
  'macha.playlists.v1.',
  'macha.musicPlaylist.v1.',
  'macha.musicLibrary.v1.',
];

/**
 * The client id to adopt back after a failed startup read minted a new one
 * over it: if the current id owns no data and exactly one other id does, that
 * one. `anonymous` is only a pre-hydration placeholder and is ignored.
 */
export function orphanedClientId(keys: readonly string[], current: string | null): string | undefined {
  const owners = new Set<string>();
  for (const key of keys) {
    const prefix = PER_CLIENT_PREFIXES.find((candidate) => key.startsWith(candidate));
    const id = prefix ? key.slice(prefix.length) : '';
    if (id && id !== 'anonymous') owners.add(id);
  }
  if (current && owners.has(current)) return undefined;
  return owners.size === 1 ? [...owners][0] : undefined;
}

/** Adopts an orphaned client id back (see `orphanedClientId`), after hydration. */
export function recoverClientId(): void {
  const current = clientStore.getItem(CLIENT_ID_KEY);
  const recovered = orphanedClientId(clientStore.keys(), current);
  if (!recovered) return;
  console.warn('[macha] [storage] client-id-recovered', { from: current, to: recovered });
  clientStore.setItem(CLIENT_ID_KEY, recovered);
}

/** Bootstrap seeds the viewer configured, not an authoritative membership list. */
export function getConfiguredEndpoints(): string[] {
  return readValidatedJson(ENDPOINTS_KEY, validEndpoints)?.urls ?? [];
}

export function setConfiguredEndpoints(urls: readonly string[]): string[] {
  const normalized = normalize(urls);
  writeJson<StoredEndpoints>(ENDPOINTS_KEY, { version: 1, urls: normalized });
  return normalized;
}

/** Nodes discovered at runtime, kept only as a hint for the next cold start's registry seed. */
export function getDiscoveredEndpoints(): string[] {
  return readValidatedJson(DISCOVERED_KEY, validEndpoints)?.urls ?? [];
}

export function setDiscoveredEndpoints(urls: readonly string[]): void {
  const normalized = normalize(urls).slice(0, MAX_DISCOVERED_ENDPOINTS);
  if (normalized.length === 0) {
    clientStore.removeItem(DISCOVERED_KEY);
    return;
  }
  writeJson<StoredEndpoints>(DISCOVERED_KEY, { version: 1, urls: normalized });
}
