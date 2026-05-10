import { useCallback, useState } from "react";
import {
  buttonClass,
  cx,
  formGroupClass,
  heroTitleClass,
  inputClass,
  labelClass,
  panelClass,
} from "../../lib/ui";

interface NameConfigModalProps {
  defaultName: string;
  onConfirm: (name: string) => void;
  onSkip: () => void;
}

export function NameConfigModal({
  defaultName,
  onConfirm,
  onSkip,
}: NameConfigModalProps) {
  const [name, setName] = useState(defaultName);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = name.trim();
      if (trimmed) {
        onConfirm(trimmed);
      }
    },
    [name, onConfirm]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm">
      <div
        aria-label="Configure display name"
        aria-modal="true"
        className={cx(panelClass, "w-full max-w-[420px]")}
        role="dialog"
      >
        <h1 className={cx(heroTitleClass, "text-base")}>
          How should others see you?
        </h1>
        <p className="m-0 mt-1 mb-4 font-medium text-fg-muted text-xs leading-normal">
          This name appears in the participant list during the meeting.
        </p>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className={formGroupClass}>
            <label className={labelClass} htmlFor="display-name-input">
              Display name
            </label>
            <input
              autoFocus
              className={inputClass}
              id="display-name-input"
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              type="text"
              value={name}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <button
              className={buttonClass({ variant: "ghost", size: "sm" })}
              onClick={onSkip}
              type="button"
            >
              Use default
            </button>
            <button
              className={buttonClass()}
              disabled={!name.trim()}
              type="submit"
            >
              Join meeting
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
