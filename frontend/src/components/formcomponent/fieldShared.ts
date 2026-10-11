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
    "ion-input, ion-textarea, ion-select, ion-radio, ion-toggle, input, select, button, textarea",
  );
  if (!target) return;
  const focusable = target as HTMLElement & { setFocus?: () => Promise<void> };
  if (typeof focusable.setFocus === "function") void focusable.setFocus();
  else target.focus();
  target.scrollIntoView?.({ block: "center", behavior: "smooth" });
};

type NativeInputHost = { getInputElement?: () => Promise<HTMLElement> };

/**
 * Ionic copies aria attributes to its native input only once on load, so a later
 * error state is mirrored onto the native input here. Only the plain state is
 * synced: id references (aria-describedby) cannot cross the shadow root.
 */
export const syncNativeInvalid = async (
  host: NativeInputHost | null | undefined,
  invalid: boolean,
): Promise<void> => {
  try {
    const native = await host?.getInputElement?.();
    if (!native) return;
    if (invalid) native.setAttribute("aria-invalid", "true");
    else native.removeAttribute("aria-invalid");
  } catch {
    // A host without a native input has nothing to sync.
  }
};

/** Resolves the element or component instance in a template ref that exposes getInputElement. */
export const nativeInputHost = (control: unknown): NativeInputHost | null => {
  const instance = control as (NativeInputHost & { $el?: NativeInputHost }) | null;
  if (typeof instance?.$el?.getInputElement === "function") return instance.$el;
  return instance ?? null;
};

/** Focuses an Ionic control (or a plain element) held in a template ref. */
export const focusControlRef = (control: unknown): void => {
  const host = (control as { $el?: HTMLElement } | null)?.$el;
  const focusable = host as (HTMLElement & { setFocus?: () => Promise<void> }) | undefined;
  if (!focusable) return;
  if (typeof focusable.setFocus === "function") void focusable.setFocus();
  else focusable.focus?.();
};
