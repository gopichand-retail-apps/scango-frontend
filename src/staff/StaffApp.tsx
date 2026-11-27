import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import "../App.css";
import "../styles/kiosk-layout.css";
import "../styles/kiosk-controls.css";
import "./staff.css";
import { loadModel } from "../lib/api";
import { copy } from "../lib/format";
import type { PublicModel } from "../lib/types";
import { StaffConsole } from "./StaffConsole";

// Separate entry for /staff: nothing in the kiosk UI links here.
export function StaffApp() {
  const [model, setModel] = useState<PublicModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    loadModel(controller.signal).then(
      (loaded) => {
        if (controller.signal.aborted) return;
        document.documentElement.lang = loaded.locale;
        document.title = `${copy(loaded, "staffConsoleTitle")} · ${loaded.data.app.name}`;
        setModel(loaded);
      },
      (failure: unknown) => {
        if (controller.signal.aborted) return;
        setError(failure instanceof Error ? failure.message : "The attendant console could not start.");
      },
    );
    return () => controller.abort();
  }, [attempt]);

  if (!model) {
    return (
      <main className="boot-state" role={error ? "alert" : "status"}>
        {error ? (
          <div className="boot-error">
            <AlertCircle size={22} aria-hidden="true" />
            <p>{error}</p>
            <button
              className="button button-primary"
              type="button"
              onClick={() => {
                setError(null);
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </button>
          </div>
        ) : (
          <span className="loading-spinner" aria-hidden="true" />
        )}
      </main>
    );
  }

  return (
    <div className="scango-shell staff-app" data-theme={model.data.app.defaultTheme}>
      <StaffConsole model={model} />
    </div>
  );
}
