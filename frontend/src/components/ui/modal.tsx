"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  /** Prevent closing while an operation is pending. */
  locked?: boolean;
}

/** Accessible modal built on the native <dialog> element (focus trap, Esc, backdrop). */
export function Modal({ open, onClose, title, description, children, footer, icon, className, locked }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!locked) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !locked) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-0 text-navy-900 shadow-elevated backdrop:bg-navy-900/40 backdrop:backdrop-blur-[2px] open:animate-slide-up",
        className,
      )}
    >
      {open && (
        <div className="p-6">
          <div className="flex items-start gap-4">
            {icon && (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-5">{icon}</div>
            )}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description && <div className="mt-1.5 text-sm leading-relaxed text-slate-500">{description}</div>}
            </div>
            {!locked && (
              <button
                type="button"
                onClick={onClose}
                className="-m-1 cursor-pointer rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close dialog"
              >
                <X className="size-5" />
              </button>
            )}
          </div>
          {children && <div className="mt-5">{children}</div>}
          {footer && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger" | "neutral";
  loading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  tone = "primary",
  loading,
  icon,
  children,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      locked={loading}
      icon={icon}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Go back
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {loading ? "Processing…" : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
