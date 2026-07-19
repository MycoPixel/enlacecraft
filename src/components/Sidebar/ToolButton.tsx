import type { ReactNode } from "react";

interface ToolButtonProps {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
  big?: boolean;
  disabled?: boolean;
}

export function ToolButton({ active, onClick, title, children, big, disabled }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={!!active}
      disabled={disabled}
      className={`tool-btn ${active ? "tool-btn--active" : ""} ${big ? "tool-btn--big" : ""} ${disabled ? "tool-btn--disabled" : ""}`}
    >
      {children}
    </button>
  );
}

export function Divider() {
  return <div className="tool-divider" />;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="section-label">{children}</div>;
}

/**
 * A lighter-weight label for a sub-group nested inside a broader section
 * (e.g. "Groups" / "Isotopes" / "Marks" within the "Atom" section) — signals
 * "still part of the section above" rather than starting a new one, so
 * closely-related pickers don't each need their own full-weight header.
 */
export function SubsectionLabel({ children }: { children: ReactNode }) {
  return <div className="subsection-label">{children}</div>;
}
