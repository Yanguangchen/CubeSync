# Free-Text Dropdown Highlighting

## TDD Progress

1. Red: Added tests for `customFields` serialization, typed-vs-selected autocomplete behavior, and dashboard highlighting/count rendering.
2. Green: Added dropdown free-text tracking in `app.js`, persisted `customFields` in `cubesync-form-data.js`, and rendered the dashboard counter, legend, and orange field tint in `dashboard.js`.
3. Refactor: Centralized dashboard custom-field count/legend helpers and kept the metadata limited to dropdown-backed request fields.
4. Hardening: Increased the dashboard orange tint contrast, preserved `customFields` when human users edit saved forms, and updated Firestore rules so dashboard result saves can write the current CubeSync payload shape.

## Behavior

Dropdown-backed request fields are tracked when the user types into the input instead of selecting an option from the suggestion dropdown. On submit, CubeSync stores the canonical field names in `customFields`.

The human dashboard uses `customFields` to:

- Show a free-text counter on the form list row.
- Show a legend in the detail panel.
- Highlight each affected field with an orange tint.

Dashboard edits keep the existing `customFields` metadata unless the field is changed through the dropdown UI. Firestore rules allow the same current request fields, result row fields, and `customFields` metadata that the dashboard saves.
