# CrossLinkOS Visual System

## Design direction

CrossLinkOS should feel like a **resale mission-control console**: focused, dark, slightly futuristic, and operational. The visual language combines a deep obsidian workspace, electric violet accents, subtle chrome/iridescent highlights, restrained pixel-art details, and compact status panels. The interface should feel distinctive without becoming a game that slows down listing work.

## Design principles

1. **Workflow first.** Listing, saving, publishing, delisting, and fulfillment actions must remain obvious and fast. Decorative effects never obscure controls or critical data.
2. **Mission-control hierarchy.** The dashboard should emphasize current inventory, active listings, pending actions, sales, and fulfillment tasks through strong panel grouping and clear status labels.
3. **Dark operational canvas.** Use an obsidian-to-navy background with faint grid or star-field texture only at low opacity. Keep content surfaces materially lighter than the page background.
4. **Electric accent system.** Use violet and ultraviolet for primary actions and selected navigation, cyan for system/connected states, green for successful or active states, amber for attention, and red for errors.
5. **Retro-futurist restraint.** Pixel-inspired labels, compact uppercase metadata, window-like card headers, and occasional scanline or grid motifs are welcome. Avoid excessive pixel art, animation, glow, or novelty typography in data-dense forms.
6. **Readable resale data.** Prices, item titles, marketplace names, inventory status, and next actions must use high-contrast text and remain legible on mobile.
7. **Progressive disclosure.** Show the next best action first. Put advanced marketplace fields, AI rationale, and automation logs behind expandable panels or secondary views.

## Core tokens

| Token | Value | Use |
|---|---|---|
| `--cx-bg` | `#090A16` | Global background |
| `--cx-surface` | `#111326` | Cards and panels |
| `--cx-surface-raised` | `#181B38` | Hovered/raised panels |
| `--cx-border` | `#343061` | Borders and separators |
| `--cx-text` | `#F4F1FF` | Primary text |
| `--cx-muted` | `#A7A5C5` | Secondary metadata |
| `--cx-violet` | `#8B5CF6` | Primary accent |
| `--cx-violet-bright` | `#B66CFF` | Focus, active, glow |
| `--cx-cyan` | `#63E6FF` | Connected/system state |
| `--cx-green` | `#61E294` | Success/active |
| `--cx-amber` | `#F6C85F` | Attention/warnings |
| `--cx-red` | `#FF7188` | Errors/destructive states |
| `--cx-pink` | `#F58CFF` | Secondary highlight |

## Component direction

The application shell should use a compact left navigation rail on desktop and a bottom or drawer navigation on mobile. Dashboard cards should use dark raised surfaces, one-pixel violet or blue borders, concise uppercase eyebrow labels, and a clear primary number or action. Listing forms should use solid high-contrast inputs rather than decorative translucent fields. Buttons should have a clear filled primary state, a quiet secondary state, and an outlined destructive state.

Marketplace cards should use platform color only as a small identity cue, never as an entire background. Status should be represented by both color and text so the product remains accessible. AI responses should appear in a distinct assistant panel with a visible confidence or fallback label. Fulfillment should use a checklist/timeline treatment that borrows from mission-control task queues.

## Motion and effects

Use short transitions for hover, panel expansion, and status updates. Avoid continuous animation, heavy blur, or large animated backgrounds. A subtle radial glow behind the dashboard header, a low-opacity grid, and occasional shimmer on active system indicators are sufficient.

## Typography

Use a highly legible sans-serif for all operational content. A compact mono or pixel-inspired face may be used only for labels, IDs, timestamps, and small section headings. Never use a novelty font for item titles, prices, form labels, or error messages.

## Acceptance criteria

The refreshed UI should preserve all current routes and workflows, work at mobile widths, maintain keyboard focus visibility, meet readable contrast for text and status states, and keep primary actions discoverable without requiring the user to understand the visual theme.

The visual refresh should be implemented as reusable tokens and shared components rather than page-specific one-off styling.

## Inspiration synthesis

The supplied references contribute four useful ideas: a purple fantasy dashboard contributes atmosphere and progression cues; the chrome/iridescent reference contributes restrained futuristic materials; the mission-control layouts contribute status/task/preview grouping; and the retro web references contribute framed panels, bright accent colors, and memorable product personality. CrossLinkOS should synthesize those ideas into a practical resale operations console rather than reproduce any reference image literally.

## Out of scope for the first UI pass

The first pass should not add a full RPG leveling system, continuous animated backgrounds, decorative 3D product renders, or a complete pixel-art asset library. Those can be considered later only if they improve retention or workflow comprehension.
ấ
