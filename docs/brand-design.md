# Brand design refresh

Visual refresh based on the approved white/yellow (#FFD400) mockups and supplied official mascot reference. No database, role, expiry calculation, notification schedule or stock mutation changes.

- Home: four status cards remain in one horizontal row at 320/390/430px widths; selected filter is explicit; compact mascot; store selector replaces tabs; only bottom navigation links to Profile.
- Compact product cards show name, status, date and quantity. Barcode, store, creator and detailed day count remain in the item dialog. Measured card heights: 94px normally, about 105px for a long two-line title. On the tested 390px-wide viewport, 700px height fits 3 full cards, 844px fits 4; 430x926 fits 5. The home header and gaps are reduced; long titles wrap to at most two lines and remain fully available in the dialog.
- Add/edit, calculator, statistics, history, profile, employee/store controls, authentication, recovery and onboarding share typography, fields, buttons, spacing and surfaces.
- Loading and existing mandatory update flow use distinct lightweight transparent mascot assets. Update detection and activation handlers are unchanged; a new defer-update feature is outside this visual change.
- Existing date editing uses three accessible dropdowns; month-end dates clamp to the last valid calendar day, as in the existing add form.
- Existing history events have a visual action icon. No new history filtering, charts, new reporting periods, partial disposal or other proposed product features are included.
- App icons: approved mascot holding the Cyrillic СГ sign, PNG 192/512, maskable 512 with margin, Apple touch 180, favicon 32. Both manifests/Service Worker copies stay synchronized. Older installed launchers may refresh icons only after OS/browser refresh or reinstall.

Assets are web-optimized versions of the approved/generated artwork. Decorative images have empty alternative text; actions and date fields have accessible labels, selected filters expose aria-pressed, motion honors prefers-reduced-motion, and input font sizes avoid mobile auto-zoom.

Validation: npm run build; node --test tests/*.test.mjs (18 tests); comparison of 13 handler groups with the previous source; isolated browser checks for four-card layout/no page overflow at narrow widths, category selection, date editing (including 29 February), calculator 15 October + 10 days = 25 October, navigation, history/statistics/profile, login/loading/update layouts. Real camera hardware, OS icon refresh and physical-device push delivery remain device checks. Browser fixtures do not write to the working database.

A separate owner-private Site hosts the working test copy. Its clearly labeled design-preview gallery uses fixture-only data, blocks external lookup and cannot write to the working database. Gallery files are private-preview-only and are not included in the production GitHub build.

Mascot refinement: the home mascot is visually scaled to 132% (118% below 360px) with transform-origin: bottom right. Its layout box and lower edge stay unchanged, so the header, filters and product list are not pushed down. Build verified; fresh browser verification was unavailable because automatic browser approval hit a usage limit.
