import { Check, ShieldCheck, Sparkles } from "lucide-react";
import { Sheet } from "./Sheet";

export function ModeSheet({ open, mode, onChange, onClose }: {
  open: boolean;
  mode: "Guided" | "Autonomous";
  onChange: (mode: "Guided" | "Autonomous") => void;
  onClose: () => void;
}) {
  const options = [
    {
      value: "Guided" as const,
      icon: ShieldCheck,
      title: "Guided",
      copy: "Review the plan and every external upload, paid action, or publish step."
    },
    {
      value: "Autonomous" as const,
      icon: Sparkles,
      title: "Autonomous",
      copy: "Let a compatible runner continue through low-risk local steps. Safety gates still stop it."
    }
  ];
  return (
    <Sheet open={open} onClose={onClose} title="How should it work?" description="Autonomy never bypasses login, consent, spend, upload, publishing, or destructive-action gates.">
      <div className="selection-list">
        {options.map((option) => (
          <button key={option.value} className={`selection-row ${mode === option.value ? "selected" : ""}`} type="button" onClick={() => onChange(option.value)}>
            <span className="selection-icon"><option.icon size={21} /></span>
            <span className="selection-copy"><strong>{option.title}</strong><span>{option.copy}</span></span>
            {mode === option.value && <Check size={18} />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
