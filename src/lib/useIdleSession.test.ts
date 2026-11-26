import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIdleSession } from "./useIdleSession";

const warningSeconds = 30;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

function renderIdle(deadline: number | null, onExpire = vi.fn()) {
  const hook = renderHook(
    (props: { deadline: number | null }) => useIdleSession({ ...props, warningSeconds, onExpire }),
    {
      initialProps: { deadline },
    },
  );
  return { ...hook, onExpire };
}

function advance(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

describe("idle session countdown", () => {
  it("is inactive without a deadline", () => {
    const { result } = renderIdle(null);
    advance(5_000);

    expect(result.current).toEqual({ phase: "inactive", secondsLeft: null });
  });

  it("counts down from the server's remaining seconds and enters the warning phase", () => {
    const { result } = renderIdle(performance.now() + 180_000);
    advance(149_000);
    expect(result.current).toEqual({ phase: "active", secondsLeft: 31 });

    advance(1_000);
    expect(result.current).toEqual({ phase: "warning", secondsLeft: 30 });
  });

  it("restarts the countdown when a fresh server deadline arrives", () => {
    const { result, rerender } = renderIdle(performance.now() + 180_000);
    advance(160_000);
    expect(result.current.phase).toBe("warning");

    rerender({ deadline: performance.now() + 180_000 });
    advance(0);
    expect(result.current).toEqual({ phase: "active", secondsLeft: 180 });
  });

  it("calls onExpire exactly once when the countdown reaches zero", () => {
    const { result, onExpire } = renderIdle(performance.now() + 180_000);
    advance(181_000);
    advance(5_000);

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ phase: "warning", secondsLeft: 0 });
  });

  it("ignores the kiosk wall clock, even six hours out", () => {
    const { result, onExpire } = renderIdle(performance.now() + 180_000);
    vi.setSystemTime(Date.now() + 6 * 60 * 60 * 1000);
    advance(1_000);
    vi.setSystemTime(Date.now() - 12 * 60 * 60 * 1000);
    advance(1_000);

    expect(onExpire).not.toHaveBeenCalled();
    expect(result.current).toEqual({ phase: "active", secondsLeft: 178 });
  });
});
