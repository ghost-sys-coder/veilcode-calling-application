# UI components

Use shadcn/ui whenever an appropriate component exists. This preference is recorded in the project `AGENTS.md` and the user's global Codex instructions.

Number onboarding composes the existing shadcn Card, Input, Textarea, Select, Checkbox, Label, Alert, Button, Dialog and AlertDialog. Phone numbers is available in the sidebar footer and workspace header; mobile navigation retains five destinations. See [number onboarding](number-onboarding.md) for behavior and setup.

The protected console uses the shadcn sidebar on desktop, with icon collapse, active navigation, and a persistent collapse preference. Phones and tablets use a fixed bottom bar composed from shadcn NavigationMenu, with all five destinations and the shared callback count. Tablet navigation floats in a centered dock. The shared console layout leaves the existing Clerk session and operator checks in place.

Console controls use shadcn Button, Input, Select, Textarea, Checkbox, Label, and AlertDialog. The original selectors were official shadcn NativeSelect controls; active console selectors now use the styled Radix Select for consistent opaque menus, keyboard navigation and selected-item indicators. Keep app behavior outside `components/ui`. Native audio controls remain appropriate for recording playback.

## Responsive navigation and selects

The bottom navigation replaces the sidebar below 1280px, and on touch tablets through 1440px. Update the media query in both `use-compact-navigation.ts` and `globals.css` when changing these breakpoints. Its links share the destination registry with the desktop sidebar and retain the dialer's unsaved-review navigation guard. During a call, navigation asks the operator to stay or end the call before leaving; calls still belong to the dialer route. Targets are at least 58px tall, selected pages use the primary color and a secondary background, and safe-area padding protects the home indicator. The content reserves bottom space, while sheets/dialogs render above the bar.

Select triggers have 44px minimum height, theme borders and card backgrounds. Portaled menus use the opaque popover token and layer above dialogs. Caller identity displays its label and complete number on separate lines. Unset ratings use an internal `unrated` option that maps back to `null` (or the form's empty rating); CSV mappings use `unmapped` and preserve numeric column zero. Never send these UI sentinel strings to the APIs. Explicitly disable the Select root while a parent form is loading or saving.

The migration was checked in local headless-browser fixtures at 320, 390, 768, 1024, 1180, 1366 touch, and 1440 desktop widths. Checks covered keyboard selection, opaque/bounded menus, viewport changes, dialog selects, CSV mappings, simulated recording controls, post-call save, playback speed, and the unsaved-review navigation guard. Fixtures use synthetic calls and in-memory responses; they do not verify live Twilio audio.

Callback reminders use shadcn Sheet, Alert, SidebarMenuBadge, and Dialog. Notifications stay passive until the operator opens the sheet, with quick actions and a separate reschedule form. See [callback reminders](callback-reminders.md).

## Theme contract

Billing and Customer access reuse Card, Table, Button, Alert, Dialog, Input,
Textarea, Label, Checkbox and Select from the existing shadcn components. Registry
Card and Table sources were checked before composing these screens. Billing is
available through the desktop footer and compact header; the mobile dock keeps
five destinations. Quotes and review decisions use labeled opaque dialogs.

`src/app/globals.css` defines the complete shadcn color tokens and exposes them through Tailwind's inline theme. Clerk's shadcn theme reads these same variables, including `--card`, `--card-foreground`, `--muted`, and `--foreground`. Missing surface tokens caused the transparent Clerk popups.

Keep `--background`, `--card`, `--popover`, and `--sidebar` opaque. Use `--brand-accent` for the orange VeilCall accent and `--ink-muted` for editorial secondary text. The standard shadcn `--accent` and `--muted` tokens represent subtle backgrounds.

## Component sources

Component source was copied from the official [shadcn/ui new-york-v4 registry](https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/new-york-v4), with local utility aliases, brand styling, accessible mobile navigation labels, a deterministic sidebar skeleton, and a React external-store subscription for the mobile breakpoint. See `src/components/ui/LICENSE` for the upstream license.

Reference: [Clerk's shadcn theme](https://clerk.com/docs/js-frontend/guides/customizing-clerk/appearance-prop/themes) and [shadcn sidebar](https://ui.shadcn.com/docs/components/radix/sidebar).
