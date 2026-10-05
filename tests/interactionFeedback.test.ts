import assert from "node:assert/strict";
import { test } from "node:test";
import { handleInteractionFeedback, interactionFeedbackOptions } from "../src/utils/interactionFeedback.ts";

test("click feedback is disabled by both motion-off spellings and reduced motion", () => {
  assert.equal(interactionFeedbackOptions("none", false), null);
  assert.equal(interactionFeedbackOptions("off", false), null);
  assert.equal(interactionFeedbackOptions("smooth", true), null);
});

test("subtle feedback uses a shorter, smaller press than smooth feedback", () => {
  const subtle = interactionFeedbackOptions("subtle", false)!;
  const smooth = interactionFeedbackOptions("smooth", false)!;
  assert.ok(subtle.duration < smooth.duration);
  assert.ok(Number(subtle.pressedScale) > Number(smooth.pressedScale));
  assert.deepEqual(interactionFeedbackOptions(undefined, false), smooth);
});

test("repeated clicks cancel prior feedback and leave no persistent animation styles", () => {
  const descriptors = new Map(["Element", "document", "window"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const animations: { frames: unknown; options: unknown; cancelled: boolean }[] = [];
  class Control {
    disabled = false;
    closest() { return this; }
    contains() { return true; }
    matches() { return this.disabled; }
    animate(frames: unknown, options: unknown) {
      const item = { frames, options, cancelled: false };
      animations.push(item);
      return { cancel() { item.cancelled = true; } };
    }
  }
  const control = new Control();
  const motion = { canvasMotion: "smooth" };
  try {
    Object.defineProperty(globalThis, "Element", { configurable: true, value: Control });
    Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: { dataset: motion } } });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => ({ matches: false }) } });
    const event = { target: control as unknown as Element, currentTarget: control as unknown as Element };
    handleInteractionFeedback(event);
    handleInteractionFeedback(event);
    assert.equal(animations.length, 2);
    assert.equal(animations[0].cancelled, true);
    assert.equal((animations[1].options as KeyframeAnimationOptions).fill, undefined);
    assert.deepEqual(animations[1].frames, [{ scale: "0.96" }, { scale: "1" }]);
    control.disabled = true;
    handleInteractionFeedback(event);
    assert.equal(animations.length, 2);
    control.disabled = false;
    motion.canvasMotion = "none";
    handleInteractionFeedback(event);
    assert.equal(animations.length, 2);
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
