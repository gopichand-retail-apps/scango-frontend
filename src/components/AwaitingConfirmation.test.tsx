import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AwaitingConfirmation } from "./AwaitingConfirmation";
import { copy } from "../lib/format";
import { model } from "../test/fixtures";

describe("awaiting confirmation", () => {
  it("explains the unconfirmed step and moves focus to a safe retry", () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(<AwaitingConfirmation model={model} busy={false} onRetry={onRetry} />);

    const panel = screen.getByRole("status");
    expect(panel).toHaveTextContent(copy(model, "awaitingConfirmationTitle"));
    expect(panel).toHaveTextContent(copy(model, "awaitingConfirmationDescription"));
    const retry = screen.getByRole("button", { name: copy(model, "retryConfirmation") });
    expect(retry).toHaveFocus();

    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("disables the retry while a check is in flight", () => {
    render(<AwaitingConfirmation model={model} busy onRetry={vi.fn()} />);

    expect(screen.getByRole("button", { name: copy(model, "retryConfirmation") })).toBeDisabled();
  });
});
