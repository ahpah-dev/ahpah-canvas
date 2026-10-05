import { useEffect, useState } from "react";

// Keep the dialog mounted long enough to play its exit animation.
export function useDialogPresence(open: boolean) {
  const [present, setPresent] = useState(open);
  useEffect(() => {
    const timer = window.setTimeout(() => setPresent(open), open ? 0 : 220);
    return () => window.clearTimeout(timer);
  }, [open]);
  return open || present;
}
