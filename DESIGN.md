# DESIGN.md — Emil Kowalski design engineering

Binding interaction and motion system for this repo. Distilled from [emilkowalski/skills](https://github.com/emilkowalski/skills), [emilkowal.ski](https://emilkowal.ski), Sonner, and Vaul.

**Product chrome vs craft.** Forklift already has its own warehouse palette in `app/globals.css` (`--steel`, `--amber`, `--paper`, etc.). Keep those colors, type, and materials unless a task explicitly restyles the product. This file is the craft contract: motion, press, origin, libraries, typography rules, and the editorial patterns from Emil’s own sites when we build a surface that should feel like his work.

Full recipes and review checklists live in the global Cursor skills (`~/.cursor/skills/` → `~/.agents/skills/`). Read those before writing motion. Do not invent parallel easing or duration tokens.

Sources: [emilkowal.ski](https://emilkowal.ski), [emilkowal.ski/skill](https://emilkowal.ski/skill), [sonner.emilkowal.ski](https://sonner.emilkowal.ski), [vaul.emilkowal.ski](https://vaul.emilkowal.ski), [animations.dev](https://animations.dev).

---

## Visual theme & atmosphere

Emil’s own surfaces are **editorial and quiet**: a warm paper canvas, one narrow reading column, almost no chrome, type doing the hierarchy. Lists are the UI. Hover is a faint wash, not a card. Motion is rare and physical. Unseen details compound; if a user notices the animation, it is probably too loud.

Mood: Linear/Vercel craft, Apple-fluid gestures, zero slop. Beauty is leverage. Good defaults beat option piles.

## Color palette & roles

Measured from emilkowal.ski (Radix-style gray, warm undertone). Use these for Emil-like editorial surfaces (docs, skill pages, marketing). Do not swap Forklift’s warehouse tokens to this scale unless asked.

### Light (default)

| Role | Token | Hex | Use |
| --- | --- | --- | --- |
| Canvas | `gray-100` | `#fdfdfc` | Page background |
| Banner / sticky chrome | `gray-200` | `#f9f9f8` | Enrollment bar, raised strips |
| Hover wash | — | `#F5F4F4` | List-row hover |
| Hairline | `gray-400` | `#e9e9e7` | Banner border |
| Selection | `gray-500` | `#e2e1de` | `::selection` |
| Placeholder / muted meta | `gray-900` | `#8d8d86` | Placeholders |
| Secondary text | `gray-1100` | `#63635e` | Body, descriptions |
| Primary text | `gray-1200` | `#21201c` | Headings, name, links |
| Hairline shadow | `--ds-shadow-border` | `0 0 0 1px rgba(0,0,0,.08)` | Toast/card edge |

### Dark

| Role | Token | Hex |
| --- | --- | --- |
| Canvas | `gray-100` | `#111110` |
| Raised | `gray-200` | `#191918` |
| Secondary text | `gray-1100` | `#b5b3ad` |
| Primary text | `gray-1200` | `#eeeeec` |

Theme: `next-themes`, class strategy, default **light**, `system` allowed. `color-scheme` follows the resolved theme. No purple gradients, no evenly-weighted accent rainbow. One accent at most; on his site there is often **no accent** — hierarchy is weight + gray step.

Code tokens (shiki): foreground is `gray-1200`, background transparent. Constants stay in the gray; functions purple (`#7142c2` light / `#b593f0` dark); strings green; parameters `#ad5700`.

## Typography

His site ships four custom families with matched fallbacks so load does not shift layout: **Sans** (UI/body), **Mono**, **Serif**, **serifInline**. Prefer a system stack (`system-ui, sans-serif`) or a face with matching x-height/weight fallbacks — never a lone webfont without a fallback that matches.

| Role | Treatment |
| --- | --- |
| Identity / name | Sans, `font-medium`, no underline, dark `gray-1200` |
| Role / kicker | Same size, `font-medium`, `leading-none`, `gray-1100` |
| Section labels | `font-medium`, block, `mb-5` / `sm:mb-4` |
| Body | `gray-1100`, `line-height: 1.65`, cap at **~65ch** (site column is `max-w-[692px]`) |
| Links | Underline is for links only. Thickness ~1.5px on emphasized links. Non-link emphasis = weight or color, never underline |
| UI emphasis | **Bold**, not italic. Italic is for citations and linguistic stress |
| Uppercase labels | Loosen letter-spacing; tight caps read cramped |
| Truncation | Use `…` (`&hellip;`), not `...` |
| Tabular data | `font-variant-numeric: tabular-nums` |
| Display (Apple rule) | Tighten tracking as size grows (`letter-spacing: -0.02em`), tight leading (`~1.05`) |

Antialiased on the root (`antialiased`). Body tracking near `0`.

## Layout principles

- **One column.** `mx-auto max-w-[692px] px-6`. Overflow hidden on small screens, visible from `md`.
- **Vertical rhythm is the grid.** Header `mb-32`. Sections `mt-16` / `sm:mt-32`. That jump is the “air.”
- **Lists, not cards.** Project/writing rows are `-mx-3 px-3 rounded-md` with a description on the next line in `gray-1100`. Gap `gap-7` on mobile, `sm:gap-4` on desktop (tighter when there is more room).
- **Sticky promo bar** sits `top-0 z-50`, `border-b`, centered copy, close is a `7×7` (`h-7 w-7`) `rounded-lg` hit target. Enters from `translateY(-100%)`.
- **Hit area.** 44px minimum. Expand with a pseudo-element if the visual is smaller.
- **Proximity = relationship.** Control next to what it affects. Specific nav labels (“Progress”, “Library”), not “Home.”

## Component stylings

Do not hand-roll primitives. Invoke `pick-ui-library` and use the curated stack.

| Need | Library |
| --- | --- |
| Dialogs, popovers, menus, selects | [base-ui](https://base-ui.com) |
| Toasts | [Sonner](https://sonner.emilkowal.ski) |
| Drawers / sheets | Vaul |
| Command menus | [cmdk](https://cmdk.paco.me) |
| Springs / layout / exit | [motion](https://motion.dev) |
| OTP | [input-otp](https://input-otp.rodz.dev) |
| Numbers | [NumberFlow](https://number-flow.barvian.me) |
| Drag and drop | [dnd kit](https://dndkit.com) |
| Virtualization | [Virtuoso](https://virtuoso.dev) |
| State | [zustand](https://zustand.docs.pmnd.rs) |
| className | [clsx](https://github.com/lukeed/clsx) |
| Variants | [cva](https://cva.style) |
| Theme | [next-themes](https://github.com/pacocoursey/next-themes) |

### Buttons & pressables

- `:active { transform: scale(0.97) }` with `transition: transform 160ms var(--ease-out)`. Scale 0.95–0.98. `scale()` scaling children is the point.
- Feedback on **pointer-down**, not click-up.
- Gate hover with `@media (hover: hover) and (pointer: fine)`.

### Popovers, menus, selects

Scale from the **trigger**, never from center:

```css
.popover { transform-origin: var(--transform-origin); } /* Base UI */
```

Enter/exit: `opacity` + `scale(0.95)`, 200ms `--ease-out`. Never `scale(0)`.

### Tooltips

125ms `--ease-out`, start at `scale(0.97)`. Initial delay to prevent accidents. Once one is open, neighbors are **instant** (`[data-instant] { transition-duration: 0ms }`).

### Modals

Exempt from origin-awareness. `transform-origin: center`, `scale(0.96)`, 250ms, backdrop opacity in lockstep.

### Drawers (Vaul)

`translateY(100%)` closed → `translateY(0)` open, `--ease-drawer`, up to 500ms. Percent translate, not px. Drag: pointer capture, velocity dismiss `> ~0.11`, rubber-band past the rim, friction not a wall. Same path in and out.

### Toasts (Sonner)

Personality is slightly slower and uses `ease` (not `--ease-out`) — cohesion over the generic UI budget. Stack: `position: absolute`, `--scale: toasts-before * 0.05 + 1`, lift by gap × index. Equalize heights to the front toast while stacked. Pause timers when `document.hidden`. Fill hover gaps with `::after`. Observer pattern: one `<Toaster />`, `toast()` from anywhere. See `ask-sonner`.

### Accordions

`height` + `opacity`, 200ms `--ease-out`. Measure height (or use a primitive). This is the rare layout animation that is allowed; keep it short.

### Tabs

Do not interpolate two colors. Duplicate the tab list, style the copy as active, clip it, animate `clip-path`. Text and background change as one surface.

### Hold to confirm

`clip-path: inset(0 100% 0 0)` overlay. Press: 2s **linear** fill. Release: 200ms `--ease-out` snap-back. Press also `scale(0.97)`.

Full CSS for each: `animate/RECIPES.md`.

## Depth & elevation

- Prefer a **1px hairline** (`--ds-shadow-border`) over a solid opaque border.
- Translucent chrome: `backdrop-filter: blur(20px) saturate(180%)` + semi-transparent fill. Content scrolls underneath. Heavier material for structure (sidebar), lighter for controls. Never stack light glass on light glass.
- Materialize glass: animate blur + scale together, not a naked opacity fade.
- Scroll-edge: fade/blur mask where sticky chrome meets content, not a 1px divider.
- Toast stack depth: scale down rear toasts (`0.05` per index) instead of extra drop-shadow.

## Motion system

These tokens are the only curves. Copy them into CSS if they are not already on `:root`.

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

| Situation | Easing | Duration |
| --- | --- | --- |
| Enter / exit | `--ease-out` | see table |
| On-screen move / morph | `--ease-in-out` | 150–250ms |
| Hover / color | `ease` | short |
| Progress / marquee | `linear` | n/a |
| Drawer | `--ease-drawer` | 200–500ms |
| Toast (Sonner personality) | `ease` | 400ms |

Duration budget:

| Element | Duration |
| --- | --- |
| Press | 100–160ms |
| Tooltip / small popover | 125–200ms |
| Dropdown / select | 150–250ms |
| Modal / drawer | 200–500ms |
| UI in general | **under 300ms** |
| Marketing / first-time | can be longer |
| Stagger between items | 30–80ms |

### Frequency gate (before any motion)

| How often | Decision |
| --- | --- |
| 100+/day, keyboard, command palette | **No animation. Ever.** |
| Tens/day (hover, list nav) | Near-zero or none |
| Occasional (modal, drawer, toast) | Standard |
| Rare / first-time | Delight budget |

Purpose must be one of: **feedback**, **spatial consistency**, **state indication**, **preventing a jarring change**, **explanation**, **delight** (rare only). “Looks cool” is not a purpose.

### Physical rules

- Never enter from `scale(0)`. Start `scale(0.9–0.97)` + `opacity: 0`.
- Enter and exit on the **same path**.
- CSS **transitions** (or springs) for anything interruptible. Keyframes restart from zero — they jump when toasts stack fast.
- Animate **transform and opacity only**. `clip-path` is the sanctioned fourth. `height` only for accordions.
- Springs for drag, flicks, Dynamic-Island-alive, interruptible gestures: `{ type: "spring", duration: 0.5, bounce: 0.2 }`. Bounce 0.1–0.3, and only when the gesture had momentum. Default UI springs are critically damped (`bounce: 0`).
- Motion `x`/`y`/`scale` shorthands are not GPU. Use `transform: "translateX(…)"`.
- Never set a parent CSS variable to drive children’s transforms.
- `prefers-reduced-motion: reduce` → keep opacity/color, drop movement. Hover only on fine pointers.

## Do’s and don’ts

**Do**

- Read `emil-design-eng` and `animate/RECIPES.md` before writing a component animation.
- Use Base UI `var(--transform-origin)` for anything anchored to a trigger.
- Pause toast timers when the tab is hidden.
- Prototype diverging variants behind the picker in `prototype/PICKER.md` when asked to explore.
- Review motion in a **Before / After / Why** table.

**Don’t**

- `transition: all`
- `ease-in` on UI
- Animate keyboard-initiated actions
- Hand-roll a toast, drawer, or focus-trapped dialog
- Mix this system’s motion tokens with a second easing scale
- Restyle Forklift’s warehouse look with the paper-gray palette unless the task says to

## Responsive behavior

- Column padding `px-6` always. Vertical padding `py-12` → `sm:py-32` → `md:py-16`.
- Section gaps expand on `sm`. List rows pick up `sm:py-3` so the hover wash has room.
- Touch: press scale still runs (`:active` is a real press). Hover washes and hover-scale do not.
- Drawers and toasts: test flicks on a real device. Velocity and rubber-banding lie in the simulator.

## Agent prompt guide

Installed globally (every Cursor project):

| Skill | When |
| --- | --- |
| `emil-design-eng` | Default craft + Sonner principles |
| `animate` | Build one animation (web) |
| `animate-expo` | React Native / Expo |
| `review-animations` | Critique a motion diff |
| `improve-animations` | Audit a whole codebase, plans only |
| `find-animation-opportunities` | Hunt for motion; mostly reject |
| `animation-vocabulary` | Name the effect |
| `apple-design` | Sheets, springs, materials, Apple type |
| `pick-ui-library` | Choose a dependency |
| `prototype` | 3+ diverging variants + picker |
| `ask-sonner` | Anything toast |
| `write-swift` | Swift / concurrency |

Quick checks:

1. Should this animate at all?
2. Name the purpose in one word from the list.
3. Cheapest tool (CSS transition → `@starting-style` → CSS animation → WAAPI → Motion).
4. Curve and duration from the tables — no invented beziers.
5. Origin, reduced motion, hover gate.

Course-level skill file (paid, not in this repo): [animations.dev](https://animations.dev/).
