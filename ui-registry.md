# VeilCall UI patterns

Use the existing shadcn components and shared warm editorial theme. Main surfaces use `--background`, panels `--card`, and dialogs `--popover`; text uses `--foreground` and supporting text `--muted-foreground`. Borders use `--border`, with the sidebar using `--sidebar-border`. Primary actions use `--primary` and destructive states `--destructive`.

## Business and number onboarding

Use the existing shadcn Card, Input, Select, Textarea, Checkbox, Label, Alert, Button, Dialog and AlertDialog; the Card, Select and AlertDialog registry documentation was checked before composition. Business and number-choice cards form two columns above 900px and stack below it. Panels have 12px corners, theme borders, no shadow and 18–24px content insets. Inputs and actions have at least 44px height. Status pills pair a text label with muted, primary or destructive theme colors. Verification codes use tabular numerals on a secondary surface; they are displayed for entry on the phone, not collected by a web OTP field. Verification and review dialogs remain opaque and scroll within the viewport. Keep the phone icon in the header at a 44px target, with the existing five mobile destinations retained.

## After-call review and recording

The after-call panel uses the official shadcn Card, Select, Label, Input, Textarea, Button and AlertDialog. Their registry entries were checked before composition. Keep the outcome and audio rating side by side above 480px, then stack them on smaller screens. The panel appears above the dialer after hang-up, with private recording playback beneath the form. Native audio remains the appropriate media control; playback speed uses Select. Unsaved drafts require confirmation before another call or reloading saved details. Recording controls replace the disabled keypad during a call; Start stays disabled until the telephone recipient answers and participant consent is confirmed.

## Bottom navigation

Compose the official shadcn NavigationMenu, List, Item and Link with Next links; use route navigation semantics rather than tabs. Background is opaque `--card`, border is `--border`, inactive text is `--muted-foreground`, and the selected link combines `--secondary` with `--primary`. Icons are 21px, labels 10–11px at weights 550/700, with 3px icon/label spacing and 12px link corners (17px in the tablet dock). Press feedback uses `--accent` immediately; transitions only affect color/background and respect reduced motion. Callback badges reuse SidebarMenuBadge with primary colors and a card-colored border. Keep phone navigation full width and tablet navigation in a centered, 24px-radius dock with a subtle shadow; account for safe-area insets and reserve content clearance below the bar.

## Styled selects

All active console dropdowns use the official shadcn Select. Triggers have 44px minimum height, theme input borders, card background, theme foreground, and the shared focus ring. Portaled menus use opaque popover colors, rounded-md corners, theme borders, and shadow-md; checked options keep the upstream indicator. Items have at least 40px height and wrap long labels. Caller-number triggers use separate label and number lines with tabular numerals. Full-width form triggers and compact playback-speed triggers share the same menu styling. Pass disabled state to the Select root, and map the internal `unrated`/`unmapped` values back to the existing API types.

## Callback reminders

Email preferences compose the existing shadcn Checkbox, Label, and Button in the reminder sheet. Keep recipient and delivery timing explicit; the preference starts off. Loading, saved, failed, and unconfigured states use the existing muted hints and status/error announcements. Display provider acceptance separately from inbox delivery.

Use shadcn Sheet for the global reminder inbox, SidebarMenuBadge for the count, Alert for passive in-app notices, and Dialog, Label, Input (`datetime-local`), and Button for rescheduling. Surfaces use opaque theme backgrounds and subtle borders. The sheet scrolls within the viewport and fills the width on small screens. Actions wrap; long notes wrap and scroll. Alerts announce politely without opening a modal, taking focus, or playing audio. Keep due labels explicit alongside color. Counts include today and overdue; the bell's new-alert count excludes database-persisted dismissals.

## CSV import

Compose the existing shadcn Dialog, AlertDialog, Input file field, Select, Label, Table, and Button. Use a scrolling opaque dialog, 1rem field gaps, .75rem muted hints, and the existing contact person/number patterns. Mapping selects use a different source-column index for each field, with labels above controls. The preview table scrolls within the dialog and paginates 50 records at a time. Use the destructive token for invalid rows and the primary token for ready/imported rows. Results use text labels as well as color.

## Dashboard

Use the official shadcn Card for metrics and panels, Select for the activity period, Skeleton for loading, Table for recent calls, and Button links for actions. Metric cards use .5rem corner radii, no shadow, 1.2rem padding, .78rem muted labels, large medium-weight values, and .7rem sample captions. Panel titles use 1.15rem medium text with .58rem spaced overlines. Callbacks reuse muted supporting text and the shared destructive token for overdue indicators. Empty and error states describe missing data explicitly.

## Outcomes and follow-ups

Compose shadcn Label, Select, Input (`datetime-local`), Textarea, and Button. Forms use 1rem field spacing and .45rem label/control spacing. Supporting text is .76rem with 1.5 line height. Review subsections use a 1px theme border and 1.25rem vertical padding. Tables reuse Contacts person/number/note/action styles. Dialog surfaces remain opaque, scroll within the viewport, and use shadcn AlertDialog for discarding changes.

## Billing and customer access

Compose shadcn Card pairs above 900px and stack below. Use Instrument Serif for
large prices/balances, muted uppercase overlines and tabular numbers for money.
Activity uses the existing Table with right-aligned currency; smaller screens
scroll the table within its card. Use opaque Dialog and Select surfaces, labeled
inputs and explicit consent before a quote simulation. Actions have 44px minimum
height; exclude Checkbox buttons from this rule and let their label provide the
larger hit target. Owner decisions use Dialog, Select and a revision-bound note.
Keep the five-item mobile dock; add account destinations to header/footer links.
