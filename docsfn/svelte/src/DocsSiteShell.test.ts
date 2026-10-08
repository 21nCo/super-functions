import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import DocsSiteShell from "./DocsSiteShell.svelte";

afterEach(() => {
  cleanup();
});

describe("DocsSiteShell", () => {
  it("renders shared site navigation and footer", () => {
    render(DocsSiteShell, {
      brand: "docsfn",
      items: [{ label: "Docs", href: "/docs" }],
      footerNote: "Built at 21n.co",
      footerLinks: [{ label: "21n.co", href: "https://21n.co", external: true }],
    });

    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("link", { name: "docsfn" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeTruthy();
    expect(screen.getByText("Built at 21n.co")).toBeTruthy();
  });

  it("removes site chrome in embedded mode", () => {
    render(DocsSiteShell, {
      embedded: true,
      brand: "docsfn",
      items: [{ label: "Docs", href: "/docs" }],
    });

    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(document.querySelector(".docsfn-site-shell--embedded")).toBeTruthy();
  });
});

it('uses the current embed mode after layout props change', async () => {
  const {rerender}=render(DocsSiteShell,{embedded:false});
  const link=document.createElement('a'); link.href='/docs/guide';document.body.append(link);
  // Stop default navigation after the capture listener has inspected the click.
  link.addEventListener('click',event=>event.preventDefault());
  const click=()=>link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
  try {
    click(); expect(link.getAttribute('href')).toBe('/docs/guide');
    await rerender({embedded:true}); click(); expect(link.getAttribute('href')).toContain('embed=1');
    link.href='/docs/guide'; await rerender({embedded:false}); click(); expect(link.getAttribute('href')).toBe('/docs/guide');
  } finally {link.remove();}
});
