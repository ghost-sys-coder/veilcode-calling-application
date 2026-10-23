# VeilCall UI patterns

Use the existing shadcn components and shared warm editorial theme. Main surfaces use `--background`, panels `--card`, and dialogs `--popover`; text uses `--foreground` and supporting text `--muted-foreground`. Borders use `--border`, with the sidebar using `--sidebar-border`. Primary actions use `--primary` and destructive states `--destructive`.

## Dashboard

Use the official shadcn Card for metrics and panels, NativeSelect for the activity period, Skeleton for loading, Table for recent calls, and Button links for actions. Metric cards use .5rem corner radii, no shadow, 1.2rem padding, .78rem muted labels, large medium-weight values, and .7rem sample captions. Panel titles use 1.15rem medium text with .58rem spaced overlines. Callbacks reuse muted supporting text and the shared destructive token for overdue indicators. Empty and error states describe missing data explicitly.

## Outcomes and follow-ups

Compose shadcn Label, NativeSelect, Input (`datetime-local`), Textarea, and Button. Forms use 1rem field spacing and .45rem label/control spacing. Supporting text is .76rem with 1.5 line height. Review subsections use a 1px theme border and 1.25rem vertical padding. Tables reuse Contacts person/number/note/action styles. Dialog surfaces remain opaque, scroll within the viewport, and use shadcn AlertDialog for discarding changes.
