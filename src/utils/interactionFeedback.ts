type ClickCaptureEvent = {
  target: EventTarget | null;
  currentTarget: EventTarget | null;
};

const feedbackAnimations = new WeakMap<HTMLElement, Animation>();

export function interactionFeedbackOptions(motion: string | undefined, reducedMotion: boolean) {
  if (reducedMotion || motion === "none" || motion === "off") return null;
  return motion === "subtle"
    ? { duration: 140, pressedScale: "0.99" }
    : { duration: 260, pressedScale: "0.96" };
}

/** Click feedback runs on the compositor, without state updates or delaying the action. */
export function handleInteractionFeedback(event: ClickCaptureEvent) {
  if (!(event.target instanceof Element) || !(event.currentTarget instanceof Element)) return;
  const control = event.target.closest<HTMLElement>("button, a[href], summary");
  if (!control || !event.currentTarget.contains(control) || control.matches(":disabled, [aria-disabled='true']")) return;
  if (typeof control.animate !== "function") return;
  const options = interactionFeedbackOptions(
    document.documentElement.dataset.canvasMotion,
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  if (!options) return;
  feedbackAnimations.get(control)?.cancel();
  const animation = control.animate(
    [{ scale: options.pressedScale }, { scale: "1" }],
    { duration: options.duration, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  );
  feedbackAnimations.set(control, animation);
}
