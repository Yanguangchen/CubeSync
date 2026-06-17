# CubeSync Design System

Design reference for the CubeSync concrete cube test request application. This document defines the brand palette, semantic tokens, typography, layout, and UI patterns used across `glassmorphic.html`, `dashboard.html`, and related stylesheets.

---

## Design principles

1. **Clarity over decoration** — One primary surface per view. Avoid stacking multiple glass/blur panels.
2. **Hierarchy through spacing and weight** — Sections are separated by whitespace, not nested cards.
3. **Legibility first** — Body text and form labels use neutral ink colors, not brand hues.
4. **Progressive disclosure** — Multi-step forms and dashboards reveal detail only when needed.
5. **Accessible interaction** — Visible focus rings, 40px minimum touch targets, and sufficient contrast on actionable elements.

---

## Brand palette

| Swatch | Name | Hex | Role |
|--------|------|-----|------|
| Mint | Primary | `#42D5BB` | Primary actions, active states, success accents |
| Blue | Secondary | `#52A0FC` | Links, secondary buttons, navigation highlights |
| Sky | Tertiary | `#8BCFFB` | Background tints, badges, soft highlights, gradients |

### Color usage

| Token | Value | Use for |
|-------|-------|---------|
| `--brand-mint` | `#42D5BB` | Primary CTA buttons, active step indicator, key metrics |
| `--brand-blue` | `#52A0FC` | Secondary actions, links, chart accents |
| `--brand-sky` | `#8BCFFB` | Page backgrounds, panel tints, hover washes |
| `--brand-mint-strong` | `#2BB8A0` | Primary button hover / pressed |
| `--brand-blue-strong` | `#3A8AE8` | Link hover, secondary button pressed |
| `--brand-sky-soft` | `#D4EDFD` | Subtle section backgrounds (internal-use blocks) |

### Gradient (backgrounds only)

Use sparingly on page backgrounds — never on form fields or table cells.

```css
background: linear-gradient(
  135deg,
  rgba(66, 213, 187, 0.12) 0%,
  rgba(82, 160, 252, 0.10) 50%,
  rgba(139, 207, 251, 0.14) 100%
);
```

Base fill beneath the gradient: `#EEF4F8`.

---

## Semantic tokens

Map brand colors to functional roles in CSS:

```css
:root {
  /* Brand */
  --brand-mint: #42d5bb;
  --brand-blue: #52a0fc;
  --brand-sky: #8bcffb;
  --brand-mint-strong: #2bb8a0;
  --brand-blue-strong: #3a8ae8;
  --brand-sky-soft: #d4edfd;

  /* Semantic */
  --accent: var(--brand-mint);
  --accent-strong: var(--brand-mint-strong);
  --accent-soft: rgba(66, 213, 187, 0.14);
  --accent-secondary: var(--brand-blue);
  --accent-secondary-soft: rgba(82, 160, 252, 0.14);
  --highlight: var(--brand-sky);
  --highlight-soft: var(--brand-sky-soft);

  /* Neutrals */
  --ink: #1f2733;
  --muted: #6b7480;
  --line: #e3e7ec;
  --line-strong: #cdd3da;
  --surface: #ffffff;
  --subtle: #f5f7f9;
  --page-bg: #eef4f8;

  /* Feedback */
  --error: #b42318;
  --error-soft: rgba(180, 35, 24, 0.10);
  --success: var(--brand-mint);
  --success-soft: var(--accent-soft);

  /* Spacing */
  --space-1: 6px;
  --space-2: 12px;
  --space-3: 18px;
  --space-4: 28px;

  /* Radius */
  --radius: 12px;
  --radius-sm: 8px;
}
```

### Contrast notes

| Combination | Guidance |
|-------------|----------|
| White text on `#42D5BB` | Passes for buttons ≥ 14px bold |
| White text on `#52A0FC` | Passes for buttons ≥ 14px bold |
| `#1F2733` text on `#8BCFFB` | Use for badges only; avoid long body copy |
| Brand colors as label text | Avoid — use `--muted` for labels instead |

---

## Typography

| Element | Font | Size | Weight | Style |
|---------|------|------|--------|-------|
| Page title (`h1`) | Outfit | 24px | 700 | Sentence case preferred |
| Section title (`h2`) | Outfit | 16px | 700 | — |
| Eyebrow / overline | Outfit | 12px | 700 | Uppercase, `letter-spacing: 0.08em`, `--brand-mint` or `--brand-blue` |
| Field label | Outfit | 11px | 600 | Uppercase, `letter-spacing: 0.04em`, `--muted` |
| Body / inputs | Outfit | 14–16px | 400 | — |
| Table header | Outfit | 11px | 700 | Uppercase, `--muted` |
| Table cell | Outfit | 13px | 400 | — |

**Font stack:** `"Outfit", Arial, Helvetica, sans-serif`

Load via Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

---

## Layout

| Property | Value |
|----------|-------|
| Max content width | `1100px` |
| Page horizontal gutter | `16px` (32px total) |
| Sheet padding | `28px` (`--space-4`) |
| Section gap | `18px` (`--space-3`) |
| Field grid | 2 columns desktop, 1 column ≤ 820px |

### Page structure (form)

```
┌─────────────────────────────────────┐
│  Action bar (Print, Clear, links)   │
├─────────────────────────────────────┤
│  Sheet                              │
│  ├─ Header (logo + contact)        │
│  ├─ Step navigation                 │
│  ├─ Step 1: Request details        │
│  └─ Step 2: Test results table     │
└─────────────────────────────────────┘
```

---

## Components

### Buttons

| Variant | Background | Border | Text |
|---------|------------|--------|------|
| Primary | `--brand-mint` | `--brand-mint` | `#ffffff` |
| Secondary | `--surface` | `--line-strong` | `--ink` |
| Ghost / link | transparent | none | `--brand-blue` |

- Min height: `40px`
- Padding: `0 18px`
- Border radius: `--radius-sm` (8px)
- Hover: darken background one step (`--brand-mint-strong`)
- Focus: `outline: 2px solid var(--brand-mint); outline-offset: 2px`

### Inputs & selects

- Min height: `40px`
- Border: `1px solid var(--line-strong)`
- Border radius: `--radius-sm`
- Focus: `border-color: var(--brand-mint); box-shadow: 0 0 0 3px var(--accent-soft)`

### Step indicators

- Default: `--muted` text, `--subtle` background
- Active: `--brand-mint` border, `--accent-soft` background, `--ink` text
- Completed: `--brand-blue` left border accent

### Cards / panels

- Single outer sheet with `--surface` background
- Optional light glass: `rgba(255, 255, 255, 0.82)` + `backdrop-filter: blur(14px)` on the main sheet only
- Internal sections use `--subtle` or `--brand-sky-soft` — not additional blur layers

### Tables (test results)

- Collapsed borders, `1px solid var(--line)`
- Sticky header with `--subtle` background
- Zebra rows: alternate `--subtle`
- Row inputs: transparent until hover/focus

### Barcode cells

- Input max-width: `220px`
- Preview area: `72px` height, `--surface` background, `--line` border
- Error state: `--error` border and message text

---

## Dashboard-specific patterns

| Element | Color application |
|---------|-------------------|
| Metric cards | `--brand-sky-soft` tint or white surface; value in `--ink`, label in `--muted` |
| Active nav / filters | `--brand-blue` underline or `--accent-soft` fill |
| Status: draft | `--brand-sky` badge |
| Status: ready | `--brand-mint` badge |
| Status: archived | `--muted` badge |
| Dark mode accent | Shift primary to `--brand-blue` (`#52A0FC`) for better contrast on dark surfaces |

---

## Icons & assets

| Asset | Path | Usage |
|-------|------|-------|
| Logo (compact) | `assets/logo.png` | Form header |
| Logo (banner) | `assets/logoBanner.png` | Dashboard topbar |

Do not recolor logos. Place on white or `--subtle` backgrounds for clarity.

---

## Motion

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Hover (buttons, inputs) | `150ms` | `ease` |
| Theme toggle / panel | `300ms` | `ease` |
| Step transition | `200ms` | `ease-out` |

Avoid animating layout properties on data-heavy views (tables).

---

## Print

- Strip decorative backgrounds and action bars
- Force `#ffffff` surfaces, `#1f2937` borders
- Landscape A4 (`@page { size: A4 landscape; margin: 10mm; }`)
- Hide barcode text inputs; show rendered barcode SVG only

---

## File map

| File | Scope |
|------|-------|
| `glassmorphic.css` | Stepped request form (primary UI) |
| `dashboard.css` | Form list, metrics, dark mode |
| `styles.css` | Original print-oriented form |
| `design.md` | This document — source of truth for tokens |

When adding new UI, define tokens in `:root` first, then reference semantic names (`--accent`, `--muted`) in component rules — not raw hex values inline.
