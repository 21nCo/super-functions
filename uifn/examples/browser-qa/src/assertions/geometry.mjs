export async function visibleBox(page, selector) {
  const locator = page.locator(selector).first();
  const box = await locator.boundingBox();
  if (!box) return { ok: false, reason: "missing-box" };
  const viewport = page.viewportSize();
  const visible =
    box.width > 0 &&
    box.height > 0 &&
    box.x < viewport.width &&
    box.y < viewport.height &&
    box.x + box.width > 0 &&
    box.y + box.height > 0;
  return {
    ok: visible,
    box: {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    },
    viewport,
  };
}

export async function assertNoMajorClipping(page, selector, options = {}) {
  const result = await visibleBox(page, selector);
  if (!result.ok || !result.box || !result.viewport) return result;
  const rightOverflow = Math.max(0, result.box.x + result.box.width - result.viewport.width);
  const bottomOverflow = Math.max(0, result.box.y + result.box.height - result.viewport.height);
  const verticalOk = options.allowVerticalOverflow
    ? result.box.y < result.viewport.height && result.box.y + result.box.height > 0
    : bottomOverflow <= Math.max(24, result.viewport.height * 0.1);
  return {
    ...result,
    ok: rightOverflow <= Math.max(24, result.viewport.width * 0.1) && verticalOk,
    overflow: { right: Math.round(rightOverflow), bottom: Math.round(bottomOverflow) },
  };
}
