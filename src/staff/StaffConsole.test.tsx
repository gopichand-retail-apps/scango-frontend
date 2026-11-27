import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { copy } from "../lib/format";
import { model } from "../test/fixtures";
import { StaffApp } from "./StaffApp";
import { StaffConsole } from "./StaffConsole";
import { useStaff } from "./useStaff";

vi.mock("./useStaff", () => ({ useStaff: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  loadModel: vi.fn(),
}));

type StaffView = ReturnType<typeof useStaff>;
const exception = {
  sessionId: "00000000-0000-4000-8000-000000000001",
  version: 4,
  since: "2026-01-01T12:00:00.000Z",
  line: { productId: "fruit-apples", name: "Honeycrisp apples", expectedWeightGrams: 980 },
};

function view(overrides: Partial<StaffView> = {}): StaffView {
  return {
    staff: null,
    exceptions: [],
    status: "signed-out",
    busy: false,
    message: null,
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    resolve: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const mockUseStaff = vi.mocked(useStaff);

beforeEach(() => {
  mockUseStaff.mockReset();
});

describe("attendant console", () => {
  it("signs in from a labelled keyboard form and shows failures as alerts", async () => {
    const user = userEvent.setup();
    const staff = view({ message: { tone: "error", text: copy(model, "staffSignInFailed") } });
    mockUseStaff.mockReturnValue(staff);
    render(<StaffConsole model={model} />);

    expect(screen.getByRole("heading", { name: copy(model, "staffConsoleTitle"), level: 1 })).toBeVisible();
    await user.type(screen.getByLabelText(copy(model, "staffCodeLabel")), "att-01");
    await user.type(screen.getByLabelText(copy(model, "staffPinLabel")), "123456{Enter}");
    expect(staff.signIn).toHaveBeenCalledWith("att-01", "123456");
    expect(screen.getByRole("alert")).toHaveTextContent(copy(model, "staffSignInFailed"));
    expect(screen.getByLabelText(copy(model, "staffPinLabel"))).toHaveAttribute("type", "password");
  });

  it("requires a reason before an attendant can approve or remove", async () => {
    const user = userEvent.setup();
    const staff = view({
      status: "ready",
      staff: { code: "att-01", name: "Attendant Alder", locationId: "store-01" },
      exceptions: [exception],
    });
    mockUseStaff.mockReturnValue(staff);
    render(<StaffConsole model={model} />);

    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("Honeycrisp apples");
    const approve = screen.getByRole("button", { name: copy(model, "staffApprove") });
    const remove = screen.getByRole("button", { name: copy(model, "staffRemove") });
    expect(approve).toBeDisabled();
    expect(remove).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(copy(model, "staffReasonLabel")), "weight_verified");
    await user.click(approve);
    await user.selectOptions(screen.getByLabelText(copy(model, "staffReasonLabel")), "item_mismatch");
    await user.click(remove);
    expect(staff.resolve).toHaveBeenNthCalledWith(1, exception, "approve_weight", "weight_verified");
    expect(staff.resolve).toHaveBeenNthCalledWith(2, exception, "remove_item", "item_mismatch");
  });

  it("shows who is signed in, an empty state, success messages and sign-out", async () => {
    const user = userEvent.setup();
    const staff = view({
      status: "ready",
      staff: { code: "att-01", name: "Attendant Alder", locationId: "store-01" },
      message: { tone: "success", text: copy(model, "staffResolved") },
    });
    mockUseStaff.mockReturnValue(staff);
    render(<StaffConsole model={model} />);

    expect(screen.getByText("Attendant Alder")).toBeVisible();
    expect(screen.getByText("store-01")).toBeVisible();
    expect(screen.getByText(copy(model, "staffNoExceptions"))).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(copy(model, "staffResolved"));
    await user.click(screen.getByRole("button", { name: copy(model, "staffSignOut") }));
    expect(staff.signOut).toHaveBeenCalledOnce();
  });
});

describe("attendant console boot", () => {
  it("loads the model, titles the page and renders the console", async () => {
    vi.mocked(api.loadModel).mockResolvedValueOnce(model);
    mockUseStaff.mockReturnValue(view());
    render(<StaffApp />);

    expect(await screen.findByRole("heading", { name: copy(model, "staffConsoleTitle"), level: 1 })).toBeVisible();
    expect(document.title).toBe(`${copy(model, "staffConsoleTitle")} · ${model.data.app.name}`);
  });

  it("ignores a model that arrives after the console has closed", async () => {
    let finishLoading: (value: typeof model) => void = () => undefined;
    vi.mocked(api.loadModel).mockReturnValueOnce(new Promise((resolve) => (finishLoading = resolve)));
    const { unmount } = render(<StaffApp />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    unmount();

    finishLoading(model);
    await Promise.resolve();
    expect(mockUseStaff).not.toHaveBeenCalled();
  });

  it("explains a failure that is not an Error and ignores failures after close", async () => {
    vi.mocked(api.loadModel).mockRejectedValueOnce("offline");
    render(<StaffApp />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The attendant console could not start.");

    let failLoading: (reason: unknown) => void = () => undefined;
    vi.mocked(api.loadModel).mockReturnValueOnce(new Promise((_, reject) => (failLoading = reject)));
    const late = render(<StaffApp />);
    late.unmount();
    failLoading(new Error("late"));
    await Promise.resolve();
  });

  it("shows a retryable error when the model cannot load", async () => {
    const user = userEvent.setup();
    vi.mocked(api.loadModel).mockRejectedValueOnce(new Error("The kiosk content model is unavailable."));
    vi.mocked(api.loadModel).mockResolvedValueOnce(model);
    mockUseStaff.mockReturnValue(view());
    render(<StaffApp />);

    expect(await screen.findByRole("alert")).toHaveTextContent("The kiosk content model is unavailable.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeVisible());
  });
});
