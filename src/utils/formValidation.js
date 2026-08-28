// Shared "focus and scroll to the first invalid field" behavior for web
// forms. A form using this:
//   1. Keeps a `fieldRefs` object (populated via ref={(el) => (fieldRefs.name = el)})
//      and a `fieldErrors` state object ({ name: "error message" }).
//   2. On submit, builds the full errors object, calls setFieldErrors(errors),
//      and if any errors exist, calls focusFirstInvalidField(fieldRefs, errors)
//      instead of (or in addition to) a summary banner.
//   3. Uses invalidClass(fieldErrors, name, baseClassName) on each input's
//      className, and renders {fieldErrors.name && <span className="field-error-text">...}
//      directly below it.

/**
 * Scrolls to and focuses the first invalid field, in visual (top-to-bottom)
 * order rather than object-key order, then smooth-scrolls it into view and
 * focuses it once the scroll has had time to start.
 */
export function focusFirstInvalidField(fieldRefs, errors) {
  const invalidNames = Object.keys(errors || {}).filter(
    (name) => errors[name] && fieldRefs[name]
  );
  if (!invalidNames.length) return;

  const sorted = invalidNames
    .map((name) => ({ name, el: fieldRefs[name] }))
    .sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top);

  const target = sorted[0].el;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => {
    if (typeof target.focus === "function") target.focus({ preventScroll: true });
  }, 320);
}

/** className helper: appends "field-invalid" when this field currently has an error. */
export function invalidClass(fieldErrors, name, base = "") {
  const hasError = Boolean(fieldErrors?.[name]);
  return [base, hasError ? "field-invalid" : ""].filter(Boolean).join(" ");
}
