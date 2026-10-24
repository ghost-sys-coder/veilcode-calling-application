# VeilCall UI patterns

Use the existing shadcn components and shared warm editorial theme. Main surfaces use `--background`, panels `--card`, and dialogs `--popover`; text uses `--foreground` and supporting text `--muted-foreground`. Borders use `--border`, with the sidebar using `--sidebar-border`. Primary actions use `--primary` and destructive states `--destructive`.

## After-call review and recording

The after-call panel uses the official shadcn Card, NativeSelect, Label, Input, Textarea, Button and AlertDialog. Their registry entries were checked before composition. Keep the outcome and audio rating side by side above 480px, then stack them on smaller screens. The panel appears above the dialer after hang-up, with private recording playback beneath the form. Native audio remains the appropriate media control; playback speed uses NativeSelect. Unsaved drafts require confirmation before another call or reloading saved details. Recording controls replace the disabled keypad during a call; Start stays disabled until the telephone recipient answers and participant consent is confirmed.

## Callback reminders

Email preferences compose the existing shadcn Checkbox, Label, and Button in the reminder sheet. Keep recipient and delivery timing explicit; the preference starts off. Loading, saved, failed, and unconfigured states use the existing muted hints and status/error announcements. Display provider acceptance separately from inbox delivery.

Use shadcn Sheet for the global reminder inbox, SidebarMenuBadge for the count, Alert for passive in-app notices, and Dialog, Label, Input (`datetime-local`), and Button for rescheduling. Surfaces use opaque theme backgrounds and subtle borders. The sheet scrolls within the viewport and fills the width on small screens. Actions wrap; long notes wrap and scroll. Alerts announce politely without opening a modal, taking focus, or playing audio. Keep due labels explicit alongside color. Counts include today and overdue; the bell's new-alert count excludes database-persisted dismissals.

## CSV import

Compose the existing shadcn Dialog, AlertDialog, Input file field, NativeSelect, Label, Table, and Button. Use a scrolling opaque dialog, 1rem field gaps, .75rem muted hints, and the existing contact person/number patterns. Mapping selects use a different source-column index for each field, with labels above controls. The preview table scrolls within the dialog and paginates 50 records at a time. Use the destructive token for invalid rows and the primary token for ready/imported rows. Results use text labels as well as color.

## Dashboard

Use the official shadcn Card for metrics and panels, NativeSelect for the activity period, Skeleton for loading, Table for recent calls, and Button links for actions. Metric cards use .5rem corner radii, no shadow, 1.2rem padding, .78rem muted labels, large medium-weight values, and .7rem sample captions. Panel titles use 1.15rem medium text with .58rem spaced overlines. Callbacks reuse muted supporting text and the shared destructive token for overdue indicators. Empty and error states describe missing data explicitly.

## Outcomes and follow-ups

Compose shadcn Label, NativeSelect, Input (`datetime-local`), Textarea, and Button. Forms use 1rem field spacing and .45rem label/control spacing. Supporting text is .76rem with 1.5 line height. Review subsections use a 1px theme border and 1.25rem vertical padding. Tables reuse Contacts person/number/note/action styles. Dialog surfaces remain opaque, scroll within the viewport, and use shadcn AlertDialog for discarding changes.
