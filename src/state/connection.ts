import * as Crypto from 'expo-crypto';
import { coerceEndpointUrl } from '../api/http';
import { clientStore, readValidatedJson, writeJson } from './storage';

const CLIENT_ID_KEY = 'macha.clientId.v1';
const ENDPOINTS_KEY = 'macha.endpoints.v1';
const DISCOVERED_KEY = 'macha.discoveredEndpoints.v1';

/** A cluster realistically has a handful of nodes; this only guards a pathological advertisement. */
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

/** Bootstrap seeds the viewer configured, not an authoritative membership list. */
export function getConfiguredEndpoints(): string[] {
  return readValidatedJson(ENDPOINTS_KEY, validEndpoints)?.urls ?? [];
}

export function setConfiguredEndpoints(urls: readonly string[]): string[] {
  const normalized = normalize(urls);
  writeJson<StoredEndpoints>(ENDPOINTS_KEY, { version: 1, urls: normalized });
  return normalized;
}

/**
 * Nodes this client has actually reached but the viewer never configured:
 * runtime-discovered membership, kept only as a resumable hint for the next
 * cold start's registry seed. Never authoritative, never user configuration.
 */
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

// There is no manual bearer token. Playback sessions are minted anonymously,
// so nothing a viewer could type into the old Settings field was ever
// load-bearing, and `macha.apiToken.v1` is left alone rather than swept: Macha
// has not shipped, so no device has ever had one written to it. If that changes
// before release, deleting a dead credential is a migration worth writing.
