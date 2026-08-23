import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axe = require("axe-core");
const preparedPages = new WeakSet();

export async function assertA11y(page, selector, options = {}) {
  if (!preparedPages.has(page)) {
    await page.addInitScript({ content: axe.source });
    preparedPages.add(page);
  }
  if (!(await page.evaluate(() => Boolean(window.axe)))) {
    await page.addScriptTag({ content: axe.source });
  }
  const result = await page.evaluate(async (rootSelector) => {
    const context = rootSelector ? document.querySelector(rootSelector) : document;
    if (!context) throw new Error(`A11y root not found: ${rootSelector}`);
    return await window.axe.run(context, {
      rules: {
        "color-contrast": { enabled: true },
      },
    });
  }, selector);

  const keyboard = selector ? await page.locator(selector).first().evaluate((root, requiresKeyboard) => {
    const focusableSelector =
      "button:not([disabled]):not([aria-hidden='true']):not([tabindex='-1']), " +
      "input:not([type='hidden']):not([disabled]):not([aria-hidden='true']):not([tabindex='-1']), " +
      "textarea:not([disabled]):not([aria-hidden='true']):not([tabindex='-1']), " +
      "select:not([disabled]):not([aria-hidden='true']):not([tabindex='-1']), " +
      "a[href]:not([aria-hidden='true']):not([tabindex='-1']), " +
      "[tabindex]:not([tabindex='-1']):not([aria-hidden='true'])";
    const focusables = [
      ...(root.matches(focusableSelector) ? [root] : []),
      ...Array.from(root.querySelectorAll(focusableSelector)),
    ].filter((node) => {
      const element = node;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    const unnamed = focusables.filter((node) => {
      const element = node;
      const labels = "labels" in element && element.labels ? Array.from(element.labels) : [];
      const hasNativeLabel = labels.some((label) => (label.textContent ?? "").trim().length > 0);
      const hasInputValueName =
        element instanceof HTMLInputElement &&
        ["button", "submit", "reset"].includes(element.type) &&
        element.value.trim().length > 0;
      return !(
        element.getAttribute("aria-label") ||
        element.getAttribute("aria-labelledby") ||
        element.getAttribute("title") ||
        (element.textContent ?? "").trim() ||
        hasNativeLabel ||
        hasInputValueName
      );
    });
    return {
      required: Boolean(requiresKeyboard),
      focusableCount: focusables.length,
      unnamedCount: unnamed.length,
      unnamed: unnamed.slice(0, 5).map((node) => ({
        tag: node.tagName.toLowerCase(),
        role: node.getAttribute("role"),
        part: node.getAttribute("data-uifn-part"),
      })),
      ok: unnamed.length === 0 && (!requiresKeyboard || focusables.length > 0),
    };
  }, options.requiresKeyboard === true) : { required: false, focusableCount: 0, unnamedCount: 0, unnamed: [], ok: true };

  return {
    ok: result.violations.length === 0 && keyboard.ok,
    violationCount: result.violations.length,
    violations: result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.slice(0, 4).flatMap((node) => node.target ?? []),
    })),
    keyboard,
  };
}
