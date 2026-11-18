# Guided form (`guided.html`)

The third public request form. It asks **one question per screen** and is built for phones first: large inputs (18px text, so iOS does not zoom), 48px+ touch targets, the Next button directly under the field so the on-screen keyboard never hides it, and the keyboard's Enter / "Next" key (or a barcode scanner that ends with Enter) moves to the next question.

It saves exactly the same request as the Digital and Original forms, with `template: "Guided"`.

## Flow

```
Company details missing                     Company details remembered on this device
──────────────────────────                  ─────────────────────────────────────────
Company details   (one per screen)          Welcome back — check saved details
Concrete & casting                                    │
People in charge                                      │
Other details                                         │
          └──────────────┬────────────────────────────┘
                         ▼
        Test results, per specimen: Specimen Ref # → Barcode → Age
                         ▼
        "N specimens added. Add another?"   (+ Add another specimen)
                         ▼
        Review & submit   (tap any row to change it, remember details, reCAPTCHA)
                         ▼
        Request sent
```

**"Company details are in"** means every required request field is filled after `app.js` has restored the remembered-details cookie (`cubesyncFormPrefs`, see [form-remember-details.md](form-remember-details.md)). Then the form opens on a *Welcome back* screen showing the contact, project, date of cast, grade and location, each tappable to change, and continues straight to the test results.

Otherwise it asks the request details one at a time:

- **First visit** (no cookie): every request question, optional ones with a **Skip** button.
- **Cookie present but incomplete** (for example a field was made required later): only the sections that still have a missing required answer.
- **Go through all details** on the Welcome back screen walks every question again with the saved answers filled in.

The review screen has **Remember company details on this device**, ticked by default. On a successful submit the details are saved to the same cookie the other forms use, so the next visit goes straight to test results. **Not your company? Forget these details** on the Welcome back screen clears the cookie and starts the questions again.

## Test results

Each specimen asks only what a customer fills in: **Specimen Ref #**, **Barcode** and **Age (days)**. Everything else comes from the existing result-row auto-fill in `cubesync-table-manager.js` ([result-row-autofill.md](result-row-autofill.md)):

| Behaviour | Source |
|-----------|--------|
| Size, slumps, grade and date of cast copied from the request details | `prefillRowFromRequest` (the guided form also fills the first row this way) |
| Rows still showing the old copy follow a changed request value | `guided.js` (size, slumps, grade); `bindRequestDateOfCast` (date of cast) |
| Next specimen ref counts on (`CUBE-01` → `CUBE-02`) | `continueSpecimenRef` |
| Barcode project code carried down (`PYY-0002/`) | `attachBarcodePrefixListeners` |
| Date of test = date of cast + age; set numbers by age | `computeRowDateOfTest`, `assignSetNumbersByAge` |
| Age copied from the specimen above when a specimen is added | `guided.js` |

The age question has 7 / 14 / 28 / 56-day buttons that fill the age and move on, and shows the resulting date of test. Testing-team columns (weight, load, strength, mode of failure) stay read-only, as on the other public forms. A specimen with no ref, barcode, age or invoice number is emptied before submitting, so it is not sent as a row of copied values only.

## How it is built

`guided.html` contains the same named controls as the other forms (request `.field-row`s, `#customRequestFields`, and `.results-table` with `data-lock-testing-team`), so `app.js` still does everything it does elsewhere: field settings (hidden fields, labels, custom fields), autocomplete, barcodes, validation, reCAPTCHA, the API submit and the local copy of submissions.

`guided.js` (`window.CubeSyncGuided`) only decides which single control is on screen:

- The current request row, or result row and cell, gets `data-guided-current`; `css/guided.css` hides everything else. Summary screens are `[data-guided-screen]` sections.
- The step list is rebuilt on every move, so fields turned off in field settings, custom fields, the Cube Job # (only after *Enable Manual Cube Job #* is on) and added or removed specimens are always current.
- Question text is the field's label (so label overrides from field settings apply); hints are per field in `guided.js`.
- A capture-phase `submit` listener checks required answers first and opens the missing question with a **Done** button that returns to the review.
- `app.js` dispatches `cubesync:saved` after a successful save (the guided form then remembers details and shows *Request sent*) and `cubesync:recordapplied` after a saved record fills the form.

The page has no `.form-step`, `#prevStep` or `#nextStep`, so `app.js`'s two-step logic for the Digital form stays off.

## Staff side

- The dashboard shows `Guided` in the template column and template field.
- **Print** opens Guided requests in the Digital form (`glassmorphic.html`), which lays out every field.
- `api/cube-request-submit.js` and `firestore.rules` accept `Guided`. Public submissions go through the API, so they work as soon as the site is deployed; **deploy the Firestore rules** before staff can switch a request's template to Guided in the dashboard.

## Tests

`guided-functional.test.js` covers the first-visit and returning flows, Enter-to-advance, the result walk and specimen auto-fill, submitting (payload, blank specimens, remember), missing-answer handling, forgetting details, hidden and custom fields, and the page contract with `app.js`.
