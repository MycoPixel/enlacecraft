import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Minimal, hardcoded-bilingual copy for the crash screen: deliberately NOT
// read from src/i18n (whose useT() hook reads the Zustand store) or from
// any other app state. If this boundary is rendering at all, something
// in the tree already threw — leaning on more app machinery to render the
// *recovery* screen risks that machinery being part of what's broken.
// document.documentElement's `lang` attribute (a plain DOM write App.tsx's
// own effect makes once, unrelated to React's render tree — see App.tsx)
// is the one language signal still safe to read here.
const COPY = {
  en: {
    title: "Something went wrong",
    body: "This part of the app hit an unexpected error and couldn't continue. Reloading should bring back your last autosaved version.",
    reload: "Reload",
    details: "Technical details",
  },
  es: {
    title: "Algo salió mal",
    body: "Esta parte de la aplicación tuvo un error inesperado y no pudo continuar. Recargar debería recuperar tu última versión autoguardada.",
    reload: "Recargar",
    details: "Detalles técnicos",
  },
};

function copyFor(): (typeof COPY)["en"] {
  return document.documentElement.getAttribute("lang") === "es" ? COPY.es : COPY.en;
}

/**
 * Top-level crash guard, wrapped around <App/> in main.tsx. Without this,
 * an unhandled exception anywhere in the render tree — most realistically
 * a malformed or edge-case imported file (a hand-edited .mol, a .cdxml
 * from some other tool) tripping a bug in a rarely-hit parsing/rendering
 * path — takes the whole app to React's default behavior: an unmounted
 * tree, i.e. a blank white page, with no indication of what happened or
 * what to do next.
 *
 * This shows a small recovery screen instead, and — since useAutosave.ts
 * restores the last snapshot on mount — a plain reload is genuinely
 * enough to recover in the overwhelming majority of cases, not just a
 * dead end with a nicer error message.
 *
 * Deliberately class-based: componentDidCatch/getDerivedStateFromError
 * have no Hook equivalent (React has no useErrorBoundary), so this is one
 * of the few places in the codebase a class component is the only option.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Nothing fancier than the console today (no crash-reporting service
    // wired into this app) — but centralizing the catch here still means
    // one place to add that later, instead of it needing to be threaded
    // through every feature that could throw.
    console.error("EnlaceCraft crashed:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const c = copyFor();
    return (
      <div className="crash-screen">
        <div className="crash-screen__box">
          <h1 className="crash-screen__title">{c.title}</h1>
          <p className="crash-screen__body">{c.body}</p>
          <button className="crash-screen__reload" onClick={() => window.location.reload()}>
            {c.reload}
          </button>
          <details className="crash-screen__details">
            <summary>{c.details}</summary>
            <pre>{error.stack ?? error.message}</pre>
          </details>
        </div>
      </div>
    );
  }
}
