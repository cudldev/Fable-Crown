/** Gameplay camera limits in tile/metre units. Strategic overview remains a separate map view. */
export const MAX_GAMEPLAY_SPAN = 32;
export const MIN_GAMEPLAY_ZOOM = 24 / MAX_GAMEPLAY_SPAN;
export const MAX_GAMEPLAY_ZOOM = 2;
export const clampGameplayZoom = (zoom: number) => Math.max(MIN_GAMEPLAY_ZOOM, Math.min(MAX_GAMEPLAY_ZOOM, Number.isFinite(zoom) ? zoom : .85));

export function gameplaySpan(zoom: number, aspect: number): number {
  // Ultrawide windows must not reveal an unbounded horizontal slice either.
  return Math.min(24 / clampGameplayZoom(zoom), 48 / Math.max(1, aspect));
}
