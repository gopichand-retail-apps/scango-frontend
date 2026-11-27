import "@fontsource-variable/roboto/wght.css";
import "@fontsource-variable/roboto-slab/wght.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { StaffApp } from "./staff/StaffApp";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("ScanGo root element is missing.");

// The attendant console has its own address and is never linked from the kiosk.
const isStaffConsole = /^\/staff\/?$/.test(window.location.pathname);

createRoot(rootElement).render(<StrictMode>{isStaffConsole ? <StaffApp /> : <App />}</StrictMode>);
