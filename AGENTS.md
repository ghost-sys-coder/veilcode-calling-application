# UI components

- Use shadcn/ui whenever a suitable component is available. Check the registry before building custom controls, dialogs, menus, navigation, sidebars, or form fields.
- Keep reusable shadcn components in `src/components/ui`; compose app-specific behavior in `src/components/console`.
- Preserve VeilCall's warm editorial palette and typography through shared theme tokens. Define all shadcn tokens used by Clerk as well as application components; popovers, sheets, and modal surfaces must be opaque.
- Use custom components only when shadcn does not cover the need or the user explicitly requests an alternative.
