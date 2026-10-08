let counter = 0;

/** A unique DOM id for wiring labels, hints and errors to a control. */
export const nextFieldId = (prefix: string): string => {
  counter += 1;
  return `${prefix}-${counter}`;
};

/** Props every form field accepts from FormComponent. */
export const fieldErrorProp = {
  error: { type: String, default: "" },
};

/** Moves keyboard focus into a field's first usable control. */
export const focusFieldHost = (host: HTMLElement | null): void => {
  if (!host) return;
  const target = host.querySelector<HTMLElement>(
    "ion-input, ion-select, ion-radio, ion-toggle, input, select, button, textarea",
  );
  if (!target) return;
  const focusable = target as HTMLElement & { setFocus?: () => Promise<void> };
  if (typeof focusable.setFocus === "function") void focusable.setFocus();
  else target.focus();
  target.scrollIntoView?.({ block: "center", behavior: "smooth" });
};
