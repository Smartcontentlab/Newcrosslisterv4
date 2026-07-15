---
name: CSS import order
description: Google Fonts @import must be first in index.css or PostCSS silently fails
---

## The rule

In `artifacts/*/src/index.css`, any `@import url(...)` (Google Fonts etc.) MUST be the very first statement — before `@import 'tailwindcss'` and all other rules.

## Why

PostCSS processes `@import` statements in order. If a `url()` import appears after `@import 'tailwindcss'` or `@import 'tw-animate-css'`, PostCSS emits a silent warning ("@import must precede all other statements") and the font fails to load. Vite logs this as a vite:css/postcss warning in the workflow.

## How to apply

```css
/* CORRECT — url() imports first */
@import url('https://fonts.googleapis.com/...');
@import 'tailwindcss';
@import 'tw-animate-css';
```

The design subagent commonly places the Google Fonts import after the tailwindcss imports. Always check and fix this after a design subagent run.
