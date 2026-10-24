# UI components

Use shadcn/ui whenever an appropriate component exists. This preference is recorded in the project `AGENTS.md` and the user's global Codex instructions.

The protected console uses the shadcn sidebar, with desktop icon collapse, a mobile Sheet, active navigation, and a persistent desktop collapse preference. The shared console layout leaves the existing Clerk session and operator checks in place.

Console controls use shadcn Button, Input, NativeSelect, Textarea, Checkbox, Label, and AlertDialog. Keep app behavior outside `components/ui`. Native audio controls remain appropriate for recording playback.

Callback reminders use shadcn Sheet, Alert, SidebarMenuBadge, and Dialog. Notifications stay passive until the operator opens the sheet, with quick actions and a separate reschedule form. See [callback reminders](callback-reminders.md).

## Theme contract

`src/app/globals.css` defines the complete shadcn color tokens and exposes them through Tailwind's inline theme. Clerk's shadcn theme reads these same variables, including `--card`, `--card-foreground`, `--muted`, and `--foreground`. Missing surface tokens caused the transparent Clerk popups.

Keep `--background`, `--card`, `--popover`, and `--sidebar` opaque. Use `--brand-accent` for the orange VeilCall accent and `--ink-muted` for editorial secondary text. The standard shadcn `--accent` and `--muted` tokens represent subtle backgrounds.

## Component sources

Component source was copied from the official [shadcn/ui new-york-v4 registry](https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/new-york-v4), with local utility aliases, brand styling, accessible mobile navigation labels, a deterministic sidebar skeleton, and a React external-store subscription for the mobile breakpoint. See `src/components/ui/LICENSE` for the upstream license.

Reference: [Clerk's shadcn theme](https://clerk.com/docs/js-frontend/guides/customizing-clerk/appearance-prop/themes) and [shadcn sidebar](https://ui.shadcn.com/docs/components/radix/sidebar).
