/**
 * A UUID source. The real one is a native module; this is its contract.
 *
 * Counted rather than random so a test can say "a different id was minted"
 * without asserting on randomness, which is the only property of this module
 * any logic here depends on.
 */
let minted = 0;

export function randomUUID(): string {
  minted += 1;
  return `00000000-0000-4000-8000-${String(minted).padStart(12, '0')}`;
}
