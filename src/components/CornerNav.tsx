import type { ReactNode } from "react";

interface CornerAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
}

export function CornerNav({ left, right }: { left: CornerAction; right: CornerAction }) {
  return (
    <nav className="corner-nav" aria-label="Quick navigation">
      <button type="button" onClick={left.onClick}>{left.icon}{left.label}</button>
      <button type="button" onClick={right.onClick}>{right.label}{right.icon}</button>
    </nav>
  );
}
