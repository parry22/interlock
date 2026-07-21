# Interlock Design System

> Single source of truth for all visual decisions. Every value here is drawn directly from the live codebase — nothing invented.

---

## Table of Contents

1. [Foundations](#1-foundations)
   - [Color](#11-color)
   - [Typography](#12-typography)
   - [Spacing](#13-spacing)
   - [Border Radius](#14-border-radius)
   - [Shadows & Borders](#15-shadows--borders)
   - [Z-Index](#16-z-index)
2. [Components](#2-components)
   - [Buttons](#21-buttons)
   - [Pills & Badges](#22-pills--badges)
   - [Cards](#23-cards)
   - [Tabs](#24-tabs)
   - [Tables](#25-tables)
   - [Inputs & Dropdowns](#26-inputs--dropdowns)
   - [Modals](#27-modals)
   - [Tooltips](#28-tooltips)
3. [Layout](#3-layout)
   - [Marketing Pages](#31-marketing-pages)
   - [Dashboard Shell](#32-dashboard-shell)
4. [Motion](#4-motion)
5. [Rules & Anti-Patterns](#5-rules--anti-patterns)

---

## 1. Foundations

### 1.1 Color

#### Brand

| Token | Value | Usage |
|-------|-------|-------|
| Blue | `#3064FF` | CTAs, active states, brand accents |
| White | `#ffffff` | Primary text, icon fills |
| Black | `#000000` | Page background, button fills, overlays |

#### Backgrounds (dark → lighter)

| Token | Value | Usage |
|-------|-------|-------|
| `bg-page` | `#000000` | Landing page, hero |
| `bg-base` | `#0d0d0f` | Deep nested elements, code blocks |
| `bg-subtle` | `#101010` | Dashboard main content area |
| `bg-card` | `#171718` | Cards, metric tiles, modals, dropdowns |
| `bg-inner` | `#111112` | Inner nested areas within cards |
| `bg-hover` | `#1c1c1c` | Table row hover, selected state |
| `bg-dropdown` | `#1a1a1a` | Dropdown menus |
| `bg-selected` | `#222222` | Dropdown selected option |

#### Borders & Dividers

| Token | Value | Usage |
|-------|-------|-------|
| `border-default` | `#1e1e1e` | Card borders, code blocks |
| `border-subtle` | `#1a1a1a` | Footer top, section dividers |
| `border-muted` | `#272727` | Dashed table row dividers |
| `border-input` | `#272727` | Secondary button border |
| `border-strong` | `#3a3a3a` | Focused inputs, open dropdowns |
| `border-brand` | `rgba(48,100,255,0.25)` | Primary pricing plan card |

#### Text

| Token | Value | Usage |
|-------|-------|-------|
| `text-primary` | `#ffffff` | Headings, values, key numbers |
| `text-body` | `#d4d4d4` | Body copy, table data |
| `text-secondary` | `#808080` | Descriptions, muted labels |
| `text-tertiary` | `#6b6b6b` | Icons, metadata |
| `text-label` | `#5a5a5a` | Column headers, stat labels |
| `text-dim` | `#3a3a3a` | Timestamps, very muted notes |
| `text-hover` | `#a3a3a3` | Hover state on interactive text |

#### Status / Semantic

| Name | Value | Usage |
|------|-------|-------|
| Green | `#4ade80` | Active, success, positive delta |
| Red | `#f87171` | Error, churned, negative delta |
| Amber | `#f59e0b` | Warning, processing |
| Cyan | `#22d3ee` | Growth plan badge |
| Yellow | `#fbbf24` | Provider split segment |
| Gray | `#9ca3af` | Tax/neutral split segment |

> **Pill opacity rule:** badge background = `${statusColor}18` (hex alpha ~10%), text = the status color at full opacity.

#### Gradients

```css
/* Fixed page glow — landing */
radial-gradient(ellipse 80% 50% at 50% 0%, rgba(30, 60, 180, 0.1) 0%, transparent 70%)

/* Fixed page glow — pricing */
radial-gradient(ellipse 80% 50% at 50% 0%, rgba(30, 60, 180, 0.07) 0%, transparent 70%)

/* Logo ticker fade edges */
linear-gradient(to left, #000, transparent)   /* right edge */
linear-gradient(to right, #000, transparent)  /* left edge */

/* Hero dashboard card (desktop) */
boxShadow: "-24px 24px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.03)"

/* Mobile hero image overlay */
linear-gradient(to bottom,
  rgba(0,0,0,0.35) 0%,
  rgba(0,0,0,0.92) 22%,
  rgba(0,0,0,0.95) 55%,
  rgba(0,0,0,0.78) 72%,
  rgba(0,0,0,0.28) 88%,
  rgba(0,0,0,0.10) 100%
)
```

---

### 1.2 Typography

#### Font families

| Role | Value |
|------|-------|
| **Primary** | `var(--font-dm-sans), sans-serif` — used everywhere |
| **Mono** | `"JetBrains Mono", "Fira Code", ui-monospace, monospace` |

> **Mono is ONLY for:** tx hashes (`0x…`), wallet addresses, blob IDs, API keys, workflow IDs, code snippets. Never use it for numbers, amounts, or labels.

#### Type scale

| Context | Size | Weight | Line Height | Tracking |
|---------|------|--------|-------------|----------|
| Hero h1 (mobile) | `32px` | Medium (500) | `1.1` | `tracking-tight` |
| Hero h1 (desktop) | `48px` | Medium (500) | `1.1` | `tracking-tight` |
| Section heading | `clamp(28px, 3.5vw, 40px)` | Semibold (600) | `1.14` | `tracking-tight` |
| Pricing title | `clamp(30px, 4vw, 52px)` | Bold (700) | `1.1` | — |
| Feature card heading | `20px` | Semibold (600) | `1.18` | — |
| Metric value (dashboard) | `28px` | Semibold (600) | `1.0` | — |
| Card title | `15px` | Semibold (600) | `1.3` | — |
| Body / description | `16px` | Regular (400) | `1.8` | — |
| Hero subtitle (desktop) | `18px` | Regular (400) | `leading-relaxed` | — |
| Hero subtitle (mobile) | `14px` | Regular (400) | `leading-relaxed` | — |
| Table data | `14px` | Medium (500) | `1.6` | — |
| Badge / label | `13px` | Medium (500) | — | — |
| Small badge | `12px` | Semibold (600) | — | — |
| Chip ("New") | `10px` | Bold (700) | — | — |
| Footer links | `13px` | Regular (400) | — | — |
| Plan name | `13px` | Semibold (600) | — | `tracking-widest` |

#### Capitalization

All label and column header words are **Title Cased** — e.g., "Platform Fee", "Net Margin", "Total Cost".

---

### 1.3 Spacing

#### Page-level containers

| Context | Value |
|---------|-------|
| Max content width | `max-w-[1200px] mx-auto px-5` |
| Section vertical padding | `py-20` (desktop), `py-14` (mobile) |
| Dashboard card padding | `px-6 py-5` |

#### Component-level spacing

| Pattern | Value |
|---------|-------|
| Card internal padding | `px-6 py-5` |
| Metric tile padding | `px-4 py-3` |
| Badge pill padding | `px-3 py-1.5` |
| Small badge padding | `px-2 py-0.5` |
| Table row gap | `gap-x-4` with `px-6` container |
| Section heading → body gap | `mb-3` / `mt-4` |
| Icon + label gap | `gap-2.5` |
| Section grid gap | `gap-6` (cards), `gap-10` (split rows) |
| Footer column gap | `gap-8` |
| Footer section gap | `gap-16` |

---

### 1.4 Border Radius

| Usage | Value |
|-------|-------|
| Cards, containers | `rounded-[20px]` |
| Feature cards (top only) | `rounded-t-[20px]` |
| Hero image, code blocks | `rounded-[14px]` |
| Modals | `rounded-2xl` (16px) |
| Buttons, inputs | `rounded-xl` (12px) |
| Endpoint badge | `rounded-[10px]` |
| Bar chart, blockquote | `rounded-[8px]` |
| Tooltip | `rounded-md` (6px) |
| Pills, status dots, CTA circle | `rounded-full` |

---

### 1.5 Shadows & Borders

#### Card borders

```css
/* Standard card */
border: 1px solid #1e1e1e;

/* Primary pricing plan */
border: 1px solid rgba(48,100,255,0.25);

/* Hero dashboard image */
border: 1px solid rgba(255,255,255,0.08);
box-shadow: -24px 24px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.03);
```

#### Dashed dividers

```css
/* Table header → row separator */
border-top: 1px dashed #272727;

/* Table rows between each other */
border-top: 1px dashed #1e1e1e;
```

> **Never** use a dashed border below card section titles — only to separate the header row from the table body, and between table rows.

---

### 1.6 Z-Index

| Layer | Value | Usage |
|-------|-------|-------|
| Background glow | `z-0` | Fixed radial gradient |
| Main content | `z-10` | Page sections |
| Backdrop | `z-[45]` | Modal/drawer overlay |
| Navigation | `z-[50]` | Top nav, landing nav |
| Morphing nav pill | `z-[60]` | Highest nav element |
| Modals & tooltips | `z-[9999]` | Floating layers |

---

## 2. Components

### 2.1 Buttons

#### CTA Button (Primary)

```tsx
<a
  className="group relative inline-flex items-center gap-2 sm:gap-3 rounded-full overflow-hidden
             pt-[6px] pb-[6px] pl-4 pr-[2px]          /* mobile */
             sm:pt-[9px] sm:pb-[9px] sm:pl-5 sm:pr-[3px]  /* desktop */"
  style={{ background: "#3064FF", border: "2px solid #3064FF" }}
>
  {/* Hover fill — black circle that scales to cover button */}
  <span className="absolute right-[2px] sm:right-[3px] top-1/2 -translate-y-1/2
                   w-[26px] h-[26px] sm:w-[32px] sm:h-[32px]
                   rounded-full bg-black scale-0 group-hover:scale-[14]
                   transition-transform duration-500 ease-in-out" />
  <span className="relative z-10 text-white font-semibold text-[13px] sm:text-[14px]">
    Label
  </span>
  <span className="relative z-10 w-[26px] h-[26px] sm:w-[32px] sm:h-[32px]
                   rounded-full flex items-center justify-center shrink-0 bg-black">
    {/* Arrow SVG — rotates -45° on hover */}
  </span>
</a>
```

#### Secondary / Outline Button

```tsx
<button
  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium
             transition-colors duration-300"
  style={{ border: "1px solid #272727", color: "#808080", background: "transparent" }}
>
  Label
</button>
```

---

### 2.2 Pills & Badges

#### Section label pill (marketing)

```tsx
<div className="inline-flex rounded-full p-[1px]"
     style={{ background: "linear-gradient(135deg, #1a1a1a, #2e2e2e)" }}>
  <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#111113]">
    <span className="text-[#3064FF] text-[13px] font-medium">Label</span>
  </div>
</div>
```

#### "New" inline chip

```tsx
<span className="text-[10px] font-bold text-white px-1.5 py-[3px] rounded-full"
      style={{ background: "#3064FF" }}>
  New
</span>
```

#### Status / role badge (tables)

```tsx
// statusConfig drives color — background = `${color}18`, text = color
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium"
      style={{ background: `${color}18`, color }}>
  Label
</span>
```

---

### 2.3 Cards

#### Standard card

```tsx
<div className="bg-[#171718] rounded-[20px] border border-[#1e1e1e] overflow-hidden">
  {/* Inner nested region */}
  <div className="bg-[#111112] ...">...</div>
</div>
```

#### Feature card (landing)

```tsx
<div className="rounded-t-[20px] overflow-hidden min-h-[280px]"
     style={{ background: "#111113", border: "1px solid #1e1e1e", borderBottom: "none" }}>
  ...
</div>
```

#### Metric tile (dashboard)

```tsx
<div className="flex flex-col gap-1 bg-[#171718] rounded-[20px] px-4 py-3
                border border-[#1e1e1e]">
  <span className="text-[12px]" style={{ color: "#5a5a5a" }}>Label</span>
  <span className="text-white text-[28px] font-semibold">Value</span>
  <span className="text-[12px] font-semibold" style={{ color: deltaColor }}>± Delta</span>
</div>
```

---

### 2.4 Tabs

```tsx
// Selected
<button className="text-white font-semibold text-[13px]">Tab</button>

// Unselected
<button className="text-[#5a5a5a] hover:text-[#a3a3a3] text-[13px] transition-colors">Tab</button>
```

> **No underline, no border-b, no dashed line** under selected tabs — weight + color change only.

---

### 2.5 Tables

```tsx
// Container
<div className="bg-[#171718] rounded-[20px] border border-[#1e1e1e] overflow-hidden">

  // Header row — separated from body by dashed border
  <div className="grid gap-x-4 px-6 py-3 border-b border-dashed border-[#272727]">
    <span className="text-[12px] font-medium uppercase tracking-wide"
          style={{ color: "#5a5a5a" }}>Column</span>
  </div>

  // Data row
  <div className="grid gap-x-4 px-6 py-3
                  border-t border-dashed border-[#1e1e1e]
                  hover:bg-[#1c1c1c] transition-colors cursor-pointer">
    <span className="text-[14px] font-medium" style={{ color: "#d4d4d4" }}>Value</span>
  </div>

</div>
```

---

### 2.6 Inputs & Dropdowns

#### Text input

```tsx
<input
  className="w-full px-4 py-3 rounded-xl text-[14px] bg-transparent outline-none
             transition-colors duration-300"
  style={{
    border: "1px solid #272727",
    color: "#d4d4d4",
  }}
  // Focus: border-color → #3a3a3a
/>
```

> Form inputs use `bg-transparent`. Filter/action pills keep `bg-[#171718]`.

#### Dropdown pill

```tsx
// Closed state
<button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[13px]
                   bg-[#171718] border border-[#1e1e1e]"
        style={{ color: "#a3a3a3" }}>
  Label <ChevronIcon />
</button>

// Open state — border darkens, bg lightens slightly
style={{ background: "#1e1e1e", borderColor: "#3a3a3a", color: "#d4d4d4" }}

// Menu
<div className="absolute bg-[#1a1a1a] border border-[#272727] rounded-xl min-w-[160px]
                shadow-2xl py-1 z-[50]">
  <button className="w-full px-4 py-2.5 text-left text-[13px] hover:bg-[#222222]"
          style={{ color: "#d4d4d4" }}>
    Option
  </button>
</div>
```

---

### 2.7 Modals

```tsx
// Backdrop
<div className="fixed inset-0 z-[9999] flex items-center justify-center">
  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

  // Panel
  <div className="relative bg-[#171718] border border-[#272727] rounded-2xl p-6
                  w-full max-w-[560px] mx-4">
    ...
  </div>
</div>
```

---

### 2.8 Tooltips

```tsx
<div className="fixed z-[9999] px-2 py-1
                bg-[#1e1e1e] border border-[#2a2a2a]
                rounded-md text-[11px] pointer-events-none"
     style={{ color: "#a3a3a3" }}>
  Tooltip text
</div>
```

---

## 3. Layout

### 3.1 Marketing Pages

Marketing pages (`/`, `/pricing`, `/blog`, `/about`, `/contact`, `/resources/*`, `/changelog`, `/privacy`, `/terms`, `/security`) are rendered **without** the dashboard shell. They share:

- Fixed `LandingNav` (64px height, `z-[50]`)
- Full-width `bg-black` page background
- Fixed radial glow (`pointer-events-none fixed inset-0 z-0`)
- `Footer` at the bottom

#### Hero section

- Section: `relative z-10 w-full overflow-hidden flex flex-col sm:block` with `minHeight: 100svh`
- Text content centred vertically on mobile via `my-auto sm:my-0`
- Desktop: text left at `pt-20`, dashboard image absolute at `left: 55%, top: 12%, bottom: 0`
- Scroll animation: `skewX(-7deg) skewY(2deg)` → `0°/0°` over first 55% of hero height, `transition: transform 0.07s ease-out`

#### Section max-width wrapper

```tsx
<div className="max-w-[1200px] mx-auto px-5">
```

---

### 3.2 Dashboard Shell

App pages (`/dashboard`, `/workflows`, `/quotes`, etc.) render inside `ShellLayout`:

```
Root layout (flex col, min-h-screen)
└── ShellLayout
    ├── Sidebar (fixed, 240px, z-40)
    ├── TopNav (h-14)
    └── main (flex-1 overflow-hidden bg-[#101010]
              mx-3 mb-20 rounded-2xl       ← mobile
              md:ml-0 md:mr-5 md:mb-5)     ← desktop
```

---

## 4. Motion

### Durations & Easing

| Usage | Duration | Easing |
|-------|----------|--------|
| Color / opacity change | `200ms` | `ease` |
| Button hover fill expand | `500ms` | `ease-in-out` |
| Arrow icon rotate | `500ms` | `ease-in-out` |
| FAQ accordion expand | `300ms` | `cubic-bezier(0.4,0,0.2,1)` |
| Nav morph / menu stagger | `420ms` | `cubic-bezier(0.4,0,0.2,1)` |
| Hero skew (scroll-linked) | `70ms` | `ease-out` |
| Table row hover | `150ms` | `ease` |

### Keyframe animations

```css
/* Logo ticker */
@keyframes marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
/* Applied: animation: marquee 28s linear infinite */

/* Live activity pulse */
/* Tailwind: animate-ping on the dot element */
```

### Transform conventions

| Effect | Implementation |
|--------|---------------|
| CTA hover fill | `scale-0` → `group-hover:scale-[14]` on `w-[32px]` circle |
| Arrow rotate on hover | `group-hover:-rotate-45` |
| FAQ toggle | `rotate(45deg)` ↔ `rotate(0deg)` |
| Hero skew | `skewX(${x}deg) skewY(${y}deg)` driven by React state |

---

## 5. Rules & Anti-Patterns

### ✅ Do

- Use **DM Sans** everywhere — including all numbers, amounts, percentages, durations, timestamps.
- Use **font-mono only** for tx hashes, wallet addresses, blob IDs, API keys, code.
- **Title-case** all label and column header words.
- Color **only on pills/badges** or explicitly color-coded diagram elements.
- Plain text values (amounts, percentages) → `text-[#d4d4d4]` or `text-[#a3a3a3]`.
- **Numeric primary stat** of a component → `text-white`.
- **Stat label** beside a value → `text-[#5a5a5a]`.
- **Dim secondary metadata** → `text-[#3a3a3a]`.
- Selected tab = `text-white font-semibold` — nothing else.
- Form inputs → `bg-transparent`. Filter / action pills → `bg-[#171718]`.

### ❌ Don't

- Don't underline, add `border-b`, or use a dashed line under selected tabs.
- Don't put a dashed border below card section titles — dashes go between table rows only.
- Don't color plain text values individually (leave them `#d4d4d4`).
- Don't use `font-mono` for regular numbers, amounts, or UI labels.
- Don't use the dashboard shell for marketing/legal pages.
- Don't use `WidthType.PERCENTAGE` in tables (breaks in Google Docs if exported).
- Don't add `text-decoration` to any navigation or inline links in `#808080` body copy — use a plain `<a>` with `no-underline` and color override.
