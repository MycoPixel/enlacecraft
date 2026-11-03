import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SharedViewer } from "./components/SharedViewer/SharedViewer";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { readShareTokenFromLocation } from "./io/shareLink";
import "./styles/theme.css";
import "./styles/app.css";

// A `#view=` link is a static, read-only viewer, not an editor session:
// mounting App would also start autosave, restore the viewer's own previous
// session over the shared drawing, and enable every editing surface. Branching
// here keeps the two modes completely separate.
const shareToken = readShareTokenFromLocation();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {shareToken ? <SharedViewer token={shareToken} /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
