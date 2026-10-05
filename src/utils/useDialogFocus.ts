import { useEffect, useLayoutEffect, useRef } from "react";

export function useDialogFocus(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(
      '[role="dialog"]:not([aria-hidden="true"])',
    );
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled):not([tabindex="-1"]),input:not(:disabled):not([type="file"]),textarea:not(:disabled),select:not(:disabled),a[href],summary',
        ) || [],
      ).filter((element) => element.getClientRects().length);
    const frame = requestAnimationFrame(() => focusable()[0]?.focus());
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [open]);
}
