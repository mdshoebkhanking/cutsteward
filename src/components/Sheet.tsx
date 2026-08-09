import { X } from "lucide-react";
import type { PropsWithChildren, ReactNode } from "react";
import { useEffect, useRef } from "react";

interface SheetProps extends PropsWithChildren {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function Sheet({ open, onClose, title, description, footer, compact, className = "", children }: SheetProps) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-layer" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={`sheet glass-surface ${compact ? "sheet-compact" : ""} ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button ref={closeButton} className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={1.6} />
          </button>
        </div>
        <div className="sheet-content">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </section>
    </div>
  );
}
