/** A UUID source stub, counted rather than random so tests can assert a new id was minted. */
let minted = 0;

export function randomUUID(): string {
  minted += 1;
  return `00000000-0000-4000-8000-${String(minted).padStart(12, '0')}`;
}
