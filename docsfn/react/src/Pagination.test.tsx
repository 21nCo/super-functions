import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { navigateTo } from "./navigation";
import { Pagination } from "./Pagination";

vi.mock("./navigation", () => ({
  navigateTo: vi.fn(),
}));

describe("Pagination", () => {
  it("supports keyboard navigation shortcuts where relevant", async () => {
    render(
      <Pagination
        prevPage={{ title: "Previous Page", path: "/docs/previous" }}
        nextPage={{ title: "Next Page", path: "/docs/next" }}
      />
    );

    expect(screen.getByRole("navigation", { name: "Page navigation" })).toBeTruthy();

    fireEvent.keyDown(window, { altKey: true, key: "ArrowRight" });
    expect(navigateTo).toHaveBeenLastCalledWith("/docs/next");

    fireEvent.keyDown(window, { altKey: true, key: "ArrowLeft" });
    expect(navigateTo).toHaveBeenLastCalledWith("/docs/previous");
  });
});

it("preserves editor shortcuts and prevents native history for handled navigation", () => {
  vi.mocked(navigateTo).mockClear();
  render(<><Pagination nextPage={{title:'Next',path:'/next'}} /><input aria-label="editor" /><div contentEditable suppressContentEditableWarning role="textbox"><span>editable child</span></div></>);
  fireEvent.keyDown(screen.getByLabelText('editor'), {altKey:true,key:'ArrowRight'});
  fireEvent.keyDown(screen.getByText('editable child'), {altKey:true,key:'ArrowRight'});
  expect(navigateTo).not.toHaveBeenCalled();
  const event = new KeyboardEvent('keydown', {altKey:true,key:'ArrowRight',cancelable:true});
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(navigateTo).toHaveBeenCalledWith('/next');
});
