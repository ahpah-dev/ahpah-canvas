import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import "./components/canvas/settings.css";
import "./studio.css";
import { applyAppearance, loadAppearance } from "./utils/appearance";

applyAppearance(loadAppearance());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
