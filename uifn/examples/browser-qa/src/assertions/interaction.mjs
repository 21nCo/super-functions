function specializedProfile(route) {
  return route.profile ?? route.contract?.qaProfile;
}

export async function exerciseInteractions(page, route, selector) {
  const root = page.locator(selector).first();
  if (!(await root.count())) return { ok: false, reason: "missing-root", performed: [], eventCounts: {} };

  const profile = specializedProfile(route);
  const performed = [];
  await page.evaluate((rootSelector) => {
    window.__uifnInteractionObserverCleanup?.();
    const counts = { click: 0, input: 0, change: 0, keydown: 0, pointerdown: 0 };
    const listeners = [];
    for (const type of Object.keys(counts)) {
      const listener = (event) => {
        const currentRoots = Array.from(document.querySelectorAll(rootSelector));
        if (
          currentRoots.length === 0 ||
          !(event.target instanceof Node) ||
          !currentRoots.some((currentRoot) => currentRoot.contains(event.target))
        ) return;
        counts[type] += 1;
      };
      document.addEventListener(type, listener, true);
      listeners.push([type, listener]);
    }
    window.__uifnInteractionCounts = counts;
    window.__uifnInteractionObserverCleanup = () => {
      for (const [type, listener] of listeners) document.removeEventListener(type, listener, true);
      delete window.__uifnInteractionObserverCleanup;
    };
  }, selector);

  const rootHoverSelectors = [
    "[data-uifn-part='trigger']:visible",
    "[role='combobox']:visible",
    "button:visible",
    "input:not([type='hidden']):visible",
    "[tabindex]:not([tabindex='-1']):visible",
  ];
  let hoverTarget = root;
  for (const hoverSelector of rootHoverSelectors) {
    const candidate = root.locator(hoverSelector).first();
    if (await candidate.count()) {
      hoverTarget = candidate;
      break;
    }
  }
  await hoverTarget.hover({ timeout: 5_000, force: true });
  performed.push("hover-root");
  await root.scrollIntoViewIfNeeded();
  performed.push("scroll-root");

  const requiredInteractions = route.contract?.requiredInteractions ?? [];
  const needsClick = requiredInteractions.some((interaction) =>
    ["click", "callback-action", "fake-client-action", "dismiss"].includes(interaction)
  );
  const needsKeyboard = requiredInteractions.some((interaction) =>
    ["keyboard", "keyboard-enter", "keyboard-space"].includes(interaction)
  );
  if (!["form", "overlay", "data-rich"].includes(profile) && route.family !== "scenario" && (needsClick || needsKeyboard)) {
    const interactiveSelector = "button:not([disabled]), input:not([type='hidden']):not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [role='button']:not([aria-disabled='true']), [tabindex]:not([tabindex='-1'])";
    const rootIsInteractive = await root.evaluate((node, candidateSelector) => node.matches(candidateSelector), interactiveSelector);
    const target = root.locator(interactiveSelector).first();
    const alternateRootIndex = await page.locator(selector).evaluateAll(
      (nodes, candidateSelector) => nodes.findIndex((node) => node.matches(candidateSelector)),
      interactiveSelector
    );
    const actionTarget = rootIsInteractive
      ? root
      : (await target.count())
        ? target
        : alternateRootIndex >= 0
          ? page.locator(selector).nth(alternateRootIndex)
          : null;
    if (!actionTarget) {
      await page.keyboard.press("Tab");
      performed.push("tab");
      const eventCounts = await page.evaluate(() => ({ ...(window.__uifnInteractionCounts ?? {}) }));
      return {
        ok: false,
        reason: "missing-enabled-action-target",
        profile,
        performed,
        eventCounts,
        focus: { withinRoot: false, activeTag: null, activeRole: null },
      };
    }
    await actionTarget.evaluate((node) => {
      if (!(node instanceof HTMLAnchorElement) || node.dataset.uifnQaNavigationGuard === "true") return;
      node.dataset.uifnQaNavigationGuard = "true";
      node.addEventListener("click", (event) => event.preventDefault());
    });
    if (needsClick) {
      await actionTarget.click();
      performed.push("click");
    }
    if (needsKeyboard) {
      await actionTarget.focus();
      await page.keyboard.press("Enter");
      performed.push("keyboard-enter");
    }
    if (needsKeyboard && ["control", "navigation"].includes(profile)) {
      await page.keyboard.press("Space");
      performed.push("keyboard-space");
    }
  }

  await page.keyboard.press("Tab");
  performed.push("tab");
  const focus = await root.evaluate((node) => {
    const active = document.activeElement;
    return {
      withinRoot: Boolean(active && node.contains(active)),
      activeTag: active instanceof HTMLElement ? active.tagName.toLowerCase() : null,
      activeRole: active instanceof HTMLElement ? active.getAttribute("role") : null,
    };
  });
  const eventCounts = await page.evaluate(() => ({ ...(window.__uifnInteractionCounts ?? {}) }));
  const expectedActionObserved = ["form", "overlay", "data-rich"].includes(profile)
    ? true
    : (!needsClick || Number(eventCounts.click ?? 0) > 0) &&
      (!needsKeyboard || Number(eventCounts.keydown ?? 0) > 0);

  return {
    ok: expectedActionObserved,
    profile,
    performed,
    eventCounts,
    focus,
  };
}
