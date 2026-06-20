# Dropdown option lists

One option per line. Used as autocomplete suggestions on the public request forms and as the reference lists for **free-text review** on the human dashboard.

## Consumers

| Consumer | Usage |
|----------|--------|
| `app.js` | `setupAutocomplete()` — merges file options with `localStorage` entries as the user types |
| `dashboard.js` | `loadDropdownOptionSets()` — fetches these files (not `localStorage`) as the canonical reference; a stored value not in its list is flagged as free text for review |

## Files

| File | Field (`name=`) |
|------|-----------------|
| `project erp.txt` | `projectErp` |
| `customer billing.txt` | `customerBilling` |
| `supplier.txt` | `supplier` |
| `Grade.txt` | `concreteGrade` |
| `person-in-charge.txt` | `personInCharge` |
| `manager-in-charge.txt` | `managerInCharge` |
| `testitem.txt` | `testItem` |
| `size.txt` | `specimenSize` |

## Deployment

`npm run build` copies this folder to `public/dropdown-options/`. If production dropdowns are empty or dashboard free-text flags never appear, confirm these URLs return text (e.g. `/dropdown-options/supplier.txt`).
