import { gsap } from "gsap";

/** Small shared animation primitives so every screen reuses the same juice instead of
 * one-off tweens. The renderer replaces the whole DOM tree on every state change
 * (see main.ts's render()), so these are all "play once on the current node" effects --
 * nothing here assumes a DOM node survives across renders. */

/** GSAP runs on requestAnimationFrame, which browsers pause for hidden/backgrounded
 * tabs -- a tween started there overwrites the freshly-rendered value with its FROM
 * value and then freezes, leaving stale numbers on screen until the next render. When
 * the tab isn't visible, skip the juice entirely: the DOM was just rendered with the
 * correct final values, so doing nothing IS the correct end state. */
function skipAnimation(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

/** Animates an element's text content from one number to another, flashing green/red
 * depending on direction. Pass the SAME element that already shows `to` (as text) --
 * this immediately overwrites it with `from` and tweens back up/down to `to`. */
export function tweenNumber(
  el: Element | null,
  from: number,
  to: number,
  opts: { duration?: number; prefix?: string; suffix?: string } = {}
) {
  if (!el || from === to || skipAnimation()) return;
  const fmt = (n: number) => `${opts.prefix ?? ""}${Math.round(n)}${opts.suffix ?? ""}`;
  const obj = { v: from };
  el.textContent = fmt(from);
  gsap.to(obj, {
    v: to,
    duration: opts.duration ?? 0.6,
    ease: "power2.out",
    onUpdate: () => {
      el.textContent = fmt(obj.v);
    },
  });
  flash(el, to > from ? "flash-up" : "flash-down");
}

/** Animates an element's CSS width (percentage) from one value to another -- used for
 * the topic Agreement/Pressure bars so a round's effect is visible as a fill sliding
 * to its new size, not just an instant jump. */
export function tweenWidth(el: Element | null, fromPct: number, toPct: number, opts: { duration?: number } = {}) {
  if (!el || fromPct === toPct || skipAnimation()) return;
  const obj = { v: fromPct };
  (el as HTMLElement).style.width = `${fromPct}%`;
  gsap.to(obj, {
    v: toPct,
    duration: opts.duration ?? 0.6,
    ease: "power2.out",
    onUpdate: () => {
      (el as HTMLElement).style.width = `${obj.v}%`;
    },
  });
}

/** Toggles a CSS class on for `duration`ms, restarting cleanly even if it's already
 * mid-animation (forces a reflow so the CSS animation replays from scratch). */
export function flash(el: Element | null, className: string, duration = 700) {
  if (!el) return;
  el.classList.remove(className);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), duration);
}

/** Fades/slides a group of elements in with a stagger, e.g. a hand of cards or a
 * round-reveal list appearing one after another instead of all at once. */
export function staggerIn(els: NodeListOf<Element> | Element[], opts: { y?: number; stagger?: number; duration?: number } = {}) {
  if (!els || els.length === 0 || skipAnimation()) return;
  gsap.fromTo(
    els,
    { opacity: 0, y: opts.y ?? 14 },
    { opacity: 1, y: 0, duration: opts.duration ?? 0.35, stagger: opts.stagger ?? 0.08, ease: "power2.out" }
  );
}

/** Emphasis pop for something that just became important -- a round's winning card,
 * a newly-picked topic, an achieved agenda cell. */
export function popIn(el: Element | null, opts: { delay?: number; duration?: number } = {}) {
  if (!el) return;
  if (skipAnimation()) {
    // popIn targets start at CSS opacity 0 (they're revealed BY this animation) --
    // snap them visible instead of leaving them hidden forever.
    (el as HTMLElement).style.opacity = "1";
    return;
  }
  gsap.fromTo(
    el,
    { scale: 0.75, opacity: 0 },
    { scale: 1, opacity: 1, duration: opts.duration ?? 0.4, delay: opts.delay ?? 0, ease: "back.out(2.2)" }
  );
}

/** A soft glowing pulse (box-shadow) drawing the eye to the round's winning play. */
export function glowPulse(el: Element | null, opts: { delay?: number } = {}) {
  if (!el || skipAnimation()) return;
  gsap.fromTo(
    el,
    { boxShadow: "0 0 0px rgba(230,190,90,0)" },
    {
      boxShadow: "0 0 26px rgba(230,190,90,0.85)",
      duration: 0.5,
      delay: opts.delay ?? 0,
      yoyo: true,
      repeat: 1,
      ease: "sine.inOut",
    }
  );
}
