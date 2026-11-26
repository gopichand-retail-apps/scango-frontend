import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IdleWarning } from "./IdleWarning";
import { copy } from "../lib/format";
import { model } from "../test/fixtures";

describe("idle warning", () => {
  it("asks the shopper to continue with the extend action focused and the seconds left shown", () => {
    const onExtend = vi.fn().mockResolvedValue(undefined);
    const onEnd = vi.fn().mockResolvedValue(undefined);
    render(<IdleWarning model={model} secondsLeft={27} busy={false} onExtend={onExtend} onEnd={onEnd} />);

    const dialog = screen.getByRole("alertdialog", { name: copy(model, "sessionIdleTitle") });
    expect(dialog).toHaveAccessibleDescription(copy(model, "sessionIdleDescription"));
    expect(screen.getByText("27")).toBeInTheDocument();
    expect(screen.getByText(copy(model, "sessionSecondsLeft"))).toBeInTheDocument();
    const extend = screen.getByRole("button", { name: copy(model, "sessionExtend") });
    expect(extend).toHaveFocus();

    fireEvent.click(extend);
    fireEvent.click(screen.getByRole("button", { name: copy(model, "sessionEndNow") }));
    expect(onExtend).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab and Shift+Tab inside the two choices", () => {
    render(<IdleWarning model={model} secondsLeft={20} busy={false} onExtend={vi.fn()} onEnd={vi.fn()} />);
    const extend = screen.getByRole("button", { name: copy(model, "sessionExtend") });
    const end = screen.getByRole("button", { name: copy(model, "sessionEndNow") });

    fireEvent.keyDown(extend, { key: "Tab" });
    expect(extend).toHaveFocus();
    end.focus();
    fireEvent.keyDown(end, { key: "Tab" });
    expect(extend).toHaveFocus();
    fireEvent.keyDown(extend, { key: "Tab", shiftKey: true });
    expect(end).toHaveFocus();
    fireEvent.keyDown(end, { key: "Enter" });
    expect(end).toHaveFocus();
  });

  it("announces the countdown only at ten-second marks", () => {
    const { rerender } = render(
      <IdleWarning model={model} secondsLeft={20} busy={false} onExtend={vi.fn()} onEnd={vi.fn()} />,
    );
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toHaveTextContent(`20 ${copy(model, "sessionSecondsLeft")}`);

    rerender(<IdleWarning model={model} secondsLeft={19} busy={false} onExtend={vi.fn()} onEnd={vi.fn()} />);
    expect(live).toBeEmptyDOMElement();
  });

  it("disables both actions while a request is in flight", () => {
    render(<IdleWarning model={model} secondsLeft={10} busy onExtend={vi.fn()} onEnd={vi.fn()} />);

    expect(screen.getByRole("button", { name: copy(model, "sessionExtend") })).toBeDisabled();
    expect(screen.getByRole("button", { name: copy(model, "sessionEndNow") })).toBeDisabled();
  });
});
