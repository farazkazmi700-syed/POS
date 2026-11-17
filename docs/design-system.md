# KazmiOn interface design

The React interface uses `apps/web/src/styles/design-system.css` for the shared product theme and `PageHeading` for module headings. Provider design work can be incorporated once Canva and Figma are connected; no provider-generated designs are included in this implementation.

## Typography

- Inter: interface, headings, forms, buttons, and tables. System sans-serif is the offline fallback.
- JetBrains Mono: identifiers, codes, and keyboard shortcuts.
- Page headings: 24–30px, weight 650. Descriptions: 13px with generous line height.
- Controls and table rows: 13–16px. Labels: sentence case, weight 550.
- Monetary metrics use tabular figures to keep columns aligned.

## Color and surfaces

- Light canvas: `#f5f7fb`; panels: white; primary text: `#18263b`.
- Dark canvas: `#0c1422`; panels: `#141f30`; primary text: `#edf2fa`.
- Primary action: `#175cd3` with white text. Orange remains a restrained brand accent.
- Use semantic success, warning, and error tokens instead of brand colors for status.
- Use solid panels, subtle borders, 14px panel corners, and 9px control corners.

## Interaction

Use `page-header` with `PageHeading` and a compact action group. Keep primary actions clearly distinguished from secondary actions. Shared controls have visible keyboard focus, 42–44px action heights, and 44px field heights. Mobile fields use 16px text to avoid browser zoom. Shared dialogs trap focus, restore focus to their trigger, and lock background scrolling. Respect reduced-motion preferences.

The shared theme applies to all business routes, installment submodules, onboarding, sign-in, and platform/developer consoles. Print styles stay separate from screen styling.

## Browser verification

With the frontend running on port 5173 and Microsoft Edge installed, run:

```powershell
npm exec --yes --package=@playwright/test -- playwright test --config=qa/playwright.config.cjs
```

The suite checks 28 routes in desktop light mode and mobile dark mode. It uses mocked demo responses and a browser-local demo session, checks page rendering and horizontal overflow, verifies the selected theme and font family, and exercises shared dialog focus and Escape behavior. Screenshots are stored under `qa/artifacts/` and excluded from Git. These are UI smoke checks, not live API integration tests.

The main sign-in page uses a fluid card over the supplied hero image on screens 1200px and wider. Smaller screens use a centered card beneath a compact image banner. Content scrolls naturally on short screens, helper text remains readable, and recovery/navigation controls have 44px touch targets. PIN verification includes an accessible progress indicator; all recovery states share the same theme tokens.

Nine additional sign-in checks cover 320–1920px widths, tablet and landscape layouts, both themes, password visibility, PIN errors, recovery completion, focus transitions and horizontal overflow. Run them separately with `--config=qa/sign-in.config.cjs`, or as part of the main browser suite.
