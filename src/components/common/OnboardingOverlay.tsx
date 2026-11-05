import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, LayoutGrid, Search, Wand2, Atom, Keyboard, type LucideIcon } from "lucide-react";
import { useT } from "../../i18n/useT";

interface Step {
  icon: LucideIcon;
  titleKey: string;
  bodyKey: string;
}

const STEPS: Step[] = [
  { icon: Sparkles, titleKey: "onboarding.step1.title", bodyKey: "onboarding.step1.body" },
  { icon: LayoutGrid, titleKey: "onboarding.step2.title", bodyKey: "onboarding.step2.body" },
  { icon: Search, titleKey: "onboarding.step3.title", bodyKey: "onboarding.step3.body" },
  { icon: Wand2, titleKey: "onboarding.step4.title", bodyKey: "onboarding.step4.body" },
  { icon: Atom, titleKey: "onboarding.step5.title", bodyKey: "onboarding.step5.body" },
  { icon: Keyboard, titleKey: "onboarding.step6.title", bodyKey: "onboarding.step6.body" },
];

/**
 * A short first-run welcome tour: a few plain slides (not a live "spotlight"
 * pointing at real sidebar elements, since this app's layout genuinely
 * differs between desktop and mobile — a fixed set of slides is far more
 * robust than trying to track and highlight live DOM positions across both).
 * Shown once automatically (see hasSeenOnboarding in the store), and
 * replayable any time from the shortcuts overlay's footer.
 */
export function OnboardingOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);

  // Always start from the first slide whenever it's (re)opened, whether
  // that's the automatic first-run show or a manual replay later.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, STEPS.length - 1));
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const Icon = current.icon;

  return createPortal(
    <div className="shortcuts-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="onboarding-dialog" role="dialog" aria-modal="true" aria-label={t(current.titleKey)}>
        <button type="button" className="onboarding-dialog__close" onClick={onClose} aria-label={t("shortcuts.close")}>
          <X size={18} />
        </button>

        <div className="onboarding-dialog__icon">
          <Icon size={30} />
        </div>
        <h2 className="onboarding-dialog__title">{t(current.titleKey)}</h2>
        <p className="onboarding-dialog__body">{t(current.bodyKey)}</p>

        <div className="onboarding-dialog__dots" aria-label={t("onboarding.stepOf", { current: String(step + 1), total: String(STEPS.length) })}>
          {STEPS.map((s, i) => (
            <button
              key={s.titleKey}
              type="button"
              className={`onboarding-dialog__dot ${i === step ? "onboarding-dialog__dot--active" : ""}`}
              onClick={() => setStep(i)}
              aria-label={t("onboarding.stepOf", { current: String(i + 1), total: String(STEPS.length) })}
            />
          ))}
        </div>

        <div className="onboarding-dialog__footer">
          {step === 0 ? (
            <button type="button" className="onboarding-dialog__btn onboarding-dialog__btn--ghost" onClick={onClose}>
              {t("onboarding.skip")}
            </button>
          ) : (
            <button type="button" className="onboarding-dialog__btn onboarding-dialog__btn--ghost" onClick={() => setStep((s) => s - 1)}>
              {t("onboarding.back")}
            </button>
          )}
          {isLast ? (
            <button type="button" className="onboarding-dialog__btn onboarding-dialog__btn--primary" onClick={onClose}>
              {t("onboarding.getStarted")}
            </button>
          ) : (
            <button type="button" className="onboarding-dialog__btn onboarding-dialog__btn--primary" onClick={() => setStep((s) => s + 1)}>
              {t("onboarding.next")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
