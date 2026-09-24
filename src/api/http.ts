import { normalizeBaseUrl } from '@machafoundation/core';

export function coerceEndpointUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const normalized = normalizeBaseUrl(withScheme);
  try {
    const url = new URL(normalized);
    if (!url.hostname) return '';
    if (!url.port && url.protocol === 'http:') url.port = String(DEFAULT_MACHA_PORT);
    return normalizeBaseUrl(url.origin);
  } catch {
    return '';
  }
}

export const DEFAULT_MACHA_PORT = 7438;
