import { Moon, ScanLine, Sun } from "lucide-react";
import { APP_VERSION } from "../app-version";
import { copy } from "../lib/format";
import type { PublicModel, ThemeMode } from "../lib/types";

interface KioskHeaderProps {
  model: PublicModel;
  connected: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export function KioskHeader({ model, connected, theme, onToggleTheme }: KioskHeaderProps) {
  const ThemeIcon = theme === "light" ? Moon : Sun;
  return (
    <header className="kiosk-header">
      <a className="kiosk-brand" href="#home" aria-label={model.data.app.name}>
        <span className="kiosk-brand-mark">
          <ScanLine size={21} aria-hidden="true" />
        </span>
        <span className="kiosk-brand-copy">
          <strong>{model.data.app.name}</strong>
          <small>{copy(model, "kioskEyebrow")}</small>
          <small>
            {copy(model, "releaseVersion")} {APP_VERSION}
          </small>
        </span>
      </a>
      <div className="kiosk-header-actions">
        <span className={connected ? "service-state is-connected" : "service-state"}>
          <span aria-hidden="true" />
          {copy(model, connected ? "serviceConnected" : "serviceUnavailable")}
        </span>
        <button
          className="icon-button"
          type="button"
          aria-label={copy(model, "themeToggle")}
          title={copy(model, "themeToggle")}
          onClick={onToggleTheme}
        >
          <ThemeIcon size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
