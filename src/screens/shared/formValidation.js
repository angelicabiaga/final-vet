// Shared "scroll and focus the first invalid field" behavior for React
// Native forms. A screen using this:
//   1. Keeps a scrollViewRef (attached to the enclosing ScrollView), a
//      fieldPositions ref object ({ name: y }) populated via each field's
//      onLayout={(e) => { fieldPositions.current.name = e.nativeEvent.layout.y; }},
//      and a fieldRefs ref object ({ name: TextInput instance }) populated
//      via ref={(el) => (fieldRefs.current.name = el)} (only meaningful for
//      actual text inputs -- checkboxes/selection containers don't need one).
//   2. On submit, builds the errors object and calls
//      scrollAndFocusFirstInvalidField({ scrollViewRef, fieldPositions, fieldRefs, errors }).
//
// Uses a plain setTimeout (not window.setTimeout -- there is no `window`
// global in the React Native runtime).

export function scrollAndFocusFirstInvalidField({ scrollViewRef, fieldPositions, fieldRefs, errors, offset = 40 }) {
  const positions = fieldPositions?.current || fieldPositions || {};
  const refs = fieldRefs?.current || fieldRefs || {};

  const invalidNames = Object.keys(errors || {}).filter(
    (name) => errors[name] && positions[name] != null
  );
  if (!invalidNames.length) return;

  const sorted = invalidNames.sort((a, b) => positions[a] - positions[b]);
  const firstName = sorted[0];
  const y = Math.max((positions[firstName] || 0) - offset, 0);

  scrollViewRef?.current?.scrollTo?.({ y, animated: true });
  setTimeout(() => {
    refs[firstName]?.focus?.();
  }, 320);
}
