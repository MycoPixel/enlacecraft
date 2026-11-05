// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

// Tells React it's safe to flush effects/state updates synchronously
// inside act() calls below — without this, React assumes it's running in
// a plain browser (no test wrapper) and warns on every act() call, even
// though the calls themselves behave correctly either way.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Bomb(): never {
  throw new Error("boom");
}

function Fine() {
  return <div data-testid="fine">still here</div>;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  document.documentElement.removeAttribute("lang");
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ErrorBoundary", () => {
  test("renders children normally when nothing throws", () => {
    act(() => {
      root.render(
        <ErrorBoundary>
          <Fine />
        </ErrorBoundary>
      );
    });
    expect(container.querySelector('[data-testid="fine"]')).not.toBeNull();
    expect(container.querySelector(".crash-screen")).toBeNull();
  });

  test("catches a render error and shows the crash screen instead of unmounting to blank", () => {
    // React logs caught errors to console.error twice (once itself, once
    // via our componentDidCatch) — expected noise for this test, not a
    // real failure; silenced so it doesn't clutter test output.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => {
      root.render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );
    });
    spy.mockRestore();

    expect(container.querySelector(".crash-screen")).not.toBeNull();
    expect(container.textContent).toContain("Something went wrong");
    expect(container.querySelector(".crash-screen__reload")).not.toBeNull();
  });

  test("shows Spanish copy when the document's lang is es", () => {
    document.documentElement.setAttribute("lang", "es");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => {
      root.render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );
    });
    spy.mockRestore();

    expect(container.textContent).toContain("Algo salió mal");
  });

  test("the crash screen's technical details include the thrown error's message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => {
      root.render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );
    });
    spy.mockRestore();

    expect(container.querySelector(".crash-screen__details pre")?.textContent).toContain("boom");
  });
});
