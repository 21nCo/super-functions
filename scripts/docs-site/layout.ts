/** Keep sticky navigation below the actual top bar, including wrapped mobile links. */
export function observeTopBar(root: HTMLElement): () => void {
  const bar = root.querySelector<HTMLElement>(".docsfn-topbar");
  if (!bar) return () => {};
  const update = () => root.style.setProperty("--docsfn-sticky-top-offset", `${bar.getBoundingClientRect().height}px`);
  update();
  const observer = new ResizeObserver(update);
  observer.observe(bar);
  return () => observer.disconnect();
}
