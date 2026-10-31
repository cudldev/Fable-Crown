export interface FeedbackRect { x: number; y: number; width: number; height: number }
export interface FeedbackAnchor { id: string; x: number; y: number; width: number; height: number }

/** Screen-space labels use a bottom-centred anchor. Never cover an earlier label. */
export function layoutFeedback(anchors: readonly FeedbackAnchor[], reserved: readonly FeedbackRect[], width: number, height: number) {
  const occupied = [...reserved], result = new Map<string, { x: number; y: number }>();
  const margin = 8, gap = 5;
  for (const anchor of anchors) {
    const w = Math.min(anchor.width, width - margin * 2), h = anchor.height;
    if (w <= 0 || h <= 0 || h > height - margin * 2) continue;
    const x = Math.max(margin + w / 2, Math.min(width - margin - w / 2, anchor.x));
    let bottom = Math.max(margin + h, Math.min(height - margin, anchor.y));
    let rect: FeedbackRect = { x: x - w / 2, y: bottom - h, width: w, height: h };
    // Each collision moves strictly upwards past a reserved rectangle. Bound work
    // by the number of rectangles; extremely crowded labels are omitted.
    for (let attempt = 0; attempt <= occupied.length; attempt++) {
      const collision = occupied.find(other => rect.x < other.x + other.width + gap && rect.x + w + gap > other.x && rect.y < other.y + other.height + gap && rect.y + h + gap > other.y);
      if (!collision) break;
      bottom = collision.y - gap; rect = { ...rect, y: bottom - h };
    }
    if (rect.y < margin) continue;
    result.set(anchor.id, { x, y: bottom }); occupied.push(rect);
  }
  return result;
}
