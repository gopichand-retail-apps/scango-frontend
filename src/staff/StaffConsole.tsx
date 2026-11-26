import { Check, LogOut, ScanLine, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { copy, formatNumber, formatTime, nestedCopy } from "../lib/format";
import { staffReasonCodes } from "../lib/schemas";
import type { PublicModel, StaffAction, StaffException, StaffReasonCode } from "../lib/types";
import { useStaff, type StaffMessage } from "./useStaff";

type Resolve = (exception: StaffException, action: StaffAction, reasonCode: StaffReasonCode) => Promise<void>;

function isReasonCode(value: string): value is StaffReasonCode {
  return (staffReasonCodes as readonly string[]).includes(value);
}

function SignInForm({
  model,
  busy,
  onSignIn,
}: {
  model: PublicModel;
  busy: boolean;
  onSignIn: (code: string, pin: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSignIn(code.trim(), pin);
    setPin("");
  }

  return (
    <section className="staff-card staff-sign-in" aria-labelledby="staff-sign-in-heading">
      <h1 id="staff-sign-in-heading">{copy(model, "staffConsoleTitle")}</h1>
      <p>{copy(model, "staffConsoleDescription")}</p>
      <form className="staff-form" onSubmit={submit}>
        <label htmlFor="staff-code">{copy(model, "staffCodeLabel")}</label>
        <input
          id="staff-code"
          name="username"
          autoComplete="username"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
        />
        <label htmlFor="staff-pin">{copy(model, "staffPinLabel")}</label>
        <input
          id="staff-pin"
          name="password"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          required
        />
        <button className="button button-primary" type="submit" disabled={busy}>
          {copy(model, "staffSignIn")}
        </button>
      </form>
    </section>
  );
}

function ExceptionRow({
  model,
  exception,
  busy,
  onResolve,
}: {
  model: PublicModel;
  exception: StaffException;
  busy: boolean;
  onResolve: Resolve;
}) {
  const [reason, setReason] = useState("");
  const selectId = `reason-${exception.sessionId}`;
  const ready = !busy && isReasonCode(reason);

  function decide(action: StaffAction) {
    if (isReasonCode(reason)) void onResolve(exception, action, reason);
  }

  return (
    <li className="staff-exception">
      <div className="staff-exception-line">
        <strong>{exception.line.name}</strong>
        <span>
          {copy(model, "staffExpectedWeight")}: {formatNumber(model, exception.line.expectedWeightGrams)} g
        </span>
        <span>
          {copy(model, "staffWaitingSince")}: {formatTime(model, exception.since)}
        </span>
      </div>
      <div className="staff-exception-decision">
        <label htmlFor={selectId}>{copy(model, "staffReasonLabel")}</label>
        <select id={selectId} value={reason} onChange={(event) => setReason(event.target.value)} required>
          <option value="">{copy(model, "staffReasonPlaceholder")}</option>
          {staffReasonCodes.map((code) => (
            <option key={code} value={code}>
              {nestedCopy(model, "staffReasons", code)}
            </option>
          ))}
        </select>
        <div className="staff-exception-actions">
          <button
            className="button button-primary"
            type="button"
            disabled={!ready}
            onClick={() => decide("approve_weight")}
          >
            <Check size={16} aria-hidden="true" />
            {copy(model, "staffApprove")}
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={!ready}
            onClick={() => decide("remove_item")}
          >
            <Trash2 size={16} aria-hidden="true" />
            {copy(model, "staffRemove")}
          </button>
        </div>
      </div>
    </li>
  );
}

function Message({ message }: { message: StaffMessage }) {
  return (
    <p className={`staff-message is-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
      {message.text}
    </p>
  );
}

export function StaffConsole({ model }: { model: PublicModel }) {
  const staff = useStaff(model);
  const signedIn = staff.status === "ready" && staff.staff !== null;

  return (
    <div className="staff-layout">
      <header className="staff-header">
        <span className="kiosk-brand-mark">
          <ScanLine size={21} aria-hidden="true" />
        </span>
        <span className="staff-header-title">
          {model.data.app.name} · {copy(model, "staffConsoleTitle")}
        </span>
        {signedIn && staff.staff ? (
          <div className="staff-identity">
            <span>
              {copy(model, "staffSignedInAs")} <strong>{staff.staff.name}</strong>
            </span>
            <span>
              {copy(model, "staffLocationLabel")} <strong>{staff.staff.locationId}</strong>
            </span>
            <button
              className="button button-secondary"
              type="button"
              disabled={staff.busy}
              onClick={() => void staff.signOut()}
            >
              <LogOut size={16} aria-hidden="true" />
              {copy(model, "staffSignOut")}
            </button>
          </div>
        ) : null}
      </header>
      <main className="staff-main" aria-busy={staff.busy}>
        {staff.message ? <Message message={staff.message} /> : null}
        {signedIn ? (
          <section className="staff-card" aria-labelledby="staff-exceptions-heading">
            <h1 id="staff-exceptions-heading">{copy(model, "staffExceptionsHeading")}</h1>
            {staff.exceptions.length === 0 ? (
              <p className="staff-empty">{copy(model, "staffNoExceptions")}</p>
            ) : (
              <ul className="staff-exceptions">
                {staff.exceptions.map((exception) => (
                  <ExceptionRow
                    key={`${exception.sessionId}:${exception.version}`}
                    model={model}
                    exception={exception}
                    busy={staff.busy}
                    onResolve={staff.resolve}
                  />
                ))}
              </ul>
            )}
          </section>
        ) : (
          <SignInForm model={model} busy={staff.busy} onSignIn={staff.signIn} />
        )}
      </main>
    </div>
  );
}
