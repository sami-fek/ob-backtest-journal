# Mobile round report: the whole site on phones and tablets

All 7 steps and the final walk are done, tested and committed.

> **⚠ Nothing is live yet.** Every push to GitHub failed with *"Claude doesn't have GitHub access to sami-fek/ob-backtest-journal"* (HTTP 403), on `main` and on the session branch. The commits exist only in this session's copy of the repo, so **the live site has not changed**.
>
> To fix it, reconnect GitHub at https://claude.ai/connect-github. If the Claude GitHub App isn't installed on the repo, install it from the same page. Then tell me "push" and I'll push the 8 commits to `main`.

## How it was tested
- **Code checks:** `node --check` on every changed JS file. Test suite: **35/35 pass** (1 new test, for the screenshot shrinking).
- **Setup:** headless Chromium with phone/tablet emulation (touch, mobile viewport) at **360×740, 390×844, 430×932 and 768×1024**, in **light and dark**. It ran against the local app (SQLite, a throwaway user with 40 seeded trades).
  - This sandbox can't reach the Tailwind, Chart.js and Font Awesome CDNs, so the tests served the same libraries from local npm copies. The live site still uses the CDNs.
- **Automated check on every screen** (`audit.cjs`, in the session scratchpad):
  - horizontal page overflow;
  - elements sticking out of the viewport;
  - tap targets under 44×44;
  - text fields under 16px.
- **Final sweep:** 17 signed-in screens plus the sign-in page and modal, × 4 widths × 2 themes = **152 screen checks**. **0 failures.** The two by-design exceptions are under "Still imperfect" below.
- **Screenshots:** I looked at every step's screenshots, not just the numbers.
- **Interaction scripts on a 360px phone:**
  - dropdown bottom sheets: pick a value, close with the backdrop, close with ✕;
  - Filter popover position;
  - trade card tap opens the trade;
  - calendar day tap opens the panel;
  - collapsible insights;
  - **every dialog stays inside the screen**, including a short 360×520 screen;
  - **nothing floats over page content** on any page.
- **End-to-end save on a phone (calendar "+" panel):**
  - all four fields picked through the bottom sheets, then direction, result and R;
  - checklist 6/12, a note, and a 10 MB, 4032×3024 camera-size photo;
  - Save → the trade is stored on the server and the drawer closes. The save rules still hold.
- **Desktop regression:** I ran the pre-mobile build (`b50f170`) side by side on a copy of the same data and pixel-compared 12 screens × 2 themes at 1440px.
  - Every screen is identical, or differs only by anti-aliasing (no pixel differs by more than 40/255).
  - **Desktop is unchanged.**

## Commits (local, not pushed)
| Commit | Step |
|---|---|
| `82eb170` | 1: header, pill nav, account menu, sign-in |
| `0ea9245` | 2: Dashboard |
| `67e2378` | 3: Trading page |
| `cb02d15` | 4: trade drawer and calendar "+" panel |
| `87df7ab` | 5: Journal and Analytics |
| `bd8654a` | 6: Account center, Settings, MT5 |
| `cd46e60` | 7: AI Coach button, dialogs in bounds |
| (this commit) | Final walk fixes and this report |

## How it's built
- **New `public/mobile.css`.** It loads last on `index.html` and `auth.html`.
  - Breakpoints: phone ≤767px, tablet 768–1023px.
  - Tap-target rules also apply on any touch screen (`pointer: coarse`).
  - Components inject their own styles at runtime, so the rules use specific selectors and `!important` where needed.
- **New `public/mobile.js`** for the few things CSS can't do:
  - keeps the active nav tab in view;
  - starts activity heatmaps on the newest weeks;
  - tracks the on-screen keyboard;
  - runs the collapsible sections;
  - docks the AI Coach button in the header.
- **Desktop (≥1024px with a mouse) is untouched.**
- `public/mobile-responsive.css` is an **old, unused** stylesheet (an earlier hamburger-menu attempt; nothing loads it). I left it alone. Delete it whenever you like.

---

## Step 1: Header, pill nav, account menu, theme switch, sign-in · `82eb170`
- **Real bug fixed: signed-out phones zoomed out.** The "nav on its own row" rule was only added after sign-in. Signed out at 390px, the nav sat on one row 380px wider than the screen, so phones zoomed the whole page out (that's the blurry, shrunken Home you'd see behind the sign-in modal).
- **Header up to 1023px:** two rows. Logo plus actions on row 1; the pill nav gets its own full-width row that **scrolls sideways and never wraps**, with the active tab kept centred.
  - On tablets, "Get started" is hidden once you're signed in (it's redundant with the nav).
  - Under 360px the "PRO OS" badge drops.
- **Tap sizes:** nav pills, avatar, menu items and the Light/Dark/System switch are all 44px.
- **Account menu:** never taller or wider than the screen; scrolls inside if needed.
- **Sign-in page and modal:**
  - 44px fields, buttons and links;
  - 16px text in fields (iOS no longer zooms in);
  - the card never exceeds the screen;
  - safe-area padding.
- **Site-wide foundation:**
  - `viewport-fit=cover` with `env(safe-area-inset-*)` padding on the header, main area, sheets and dialogs;
  - 100dvh in place of 100vh (index, auth page, account dialogs, Tailwind `min-h-screen` / `max-h-[90vh]`);
  - 16px text in every text field, select and rich-text editor on phones, tablets and touch screens;
  - `touch-action: manipulation` (no double-tap zoom delay);
  - `overflow-x: clip`, so there's never a sideways page scroll.

## Step 2: Dashboard · `0ea9245`
- **Stat cards:** phones show 1 + 2 + 2 (Net P&L full width). On tablets, the 5 cards now sit 2 + 3 instead of leaving a hole.
- **Charts:** resize; 240px tall on phones.
- **Calendar (shared by the Dashboard and Trading):**
  - short labels on phones: S M T W T F S, "Wk", "W1", "2T" (trade count), with smaller cells;
  - **on touch screens, tapping anywhere on a day opens the "+" panel.** The 17px "+" can't be hit with a finger, so it's now just a hint;
  - the hint text says "tap a day" on touch screens.
- **Recent Trades:** stacked cards on phones, showing side, pair, P&L / date, strategy, result, R. The whole card opens the trade.
- **Bug fixed: Filter popover.** It opened about 170px off the left edge of the screen on phones. It now opens on-screen.
- **Controls:** all 44px (mode switch, account, range, filter, month arrows, pager).

## Step 3: Trading page · `67e2378`
- **LOG A TRADE:** one field per row on phones. Fields, toggles (LONG/SHORT, WIN/LOSS/BE) and Add trade are 44px.
  - R-Multiple stays `type=number`, which gives iOS a keyboard that includes the minus sign; `inputmode=decimal` would drop it.
  - Date stays `type=date`.
- **Custom dropdowns become bottom sheets on phones** (`ui-dropdowns.js`, so it covers LOG A TRADE, the drawer and the calendar panel):
  - title and ✕, 48px rows, a backdrop that closes it, page scroll locked while open;
  - strategy actions ("+ Create new / Edit checklist / Delete strategy") still sit at the bottom;
  - desktop dropdowns are unchanged.
- **Execution Log:** cards on phones. Pair · direction · R / date · TF · regime · result / rule status · 44px eye and trash. Tapping the card opens the trade.
  - Cells are now tagged `data-col`, so this works even though another script removes a column at runtime.
- **Calendar card:** the title no longer squeezes into 5 lines, and "This month" is no longer cut off. Month controls sit on their own row.
- **Filters:** two per row.
- **Trading Activity heatmap:** opens on the newest weeks (it used to start in May).
- **Discipline:** the hard-stop/daily-limit banner ✕ and the hard-stop dialog buttons are 44px. ("Discipline & Rules Status" lives on the Journal page and is covered in Step 5.)

## Step 4: Trade drawer and calendar "+" panel · `cb02d15`
These are the same element (`#tradeDrawer`).
- **Layout:**
  - **phones:** a full-screen sheet that slides up from the bottom;
  - **header:** sticky, with a 44px ✕ and safe-area padding;
  - **bottom bar:** sticky, with the **requirement list** (trade details, checklist 50%, note, screenshot) on top and **Save · AI · Delete/Discard on one row**. Under 430px the AI button is icon-only (with an accessible label) so the row fits.
- **Tap sizes:** 44px checklist ✓/✕, note toolbar (scrolls sideways at 360), tag input and tag ✕, feelings, "+ screenshot" and dropdowns. The screenshot ✕ looks 32px but its tap area is 44px.
- **Keyboard:**
  - `mobile.js` follows the visible area (`visualViewport`), so while the keyboard is open the drawer fits above it;
  - the bar shrinks to just the Save row;
  - the focused field is scrolled into the middle of the visible area;
  - `interactive-widget=resizes-content` asks Android Chrome to resize the page for the keyboard.
- **Photos from the camera and gallery:**
  - The input stays `accept="image/*"` with no `capture` attribute, so phones offer **Take Photo / Photo Library / Files**.
  - **Real bug fixed:** screenshots are stored inside your trades record, which the server caps at **12 MB**. Three raw phone photos (4–10 MB each, about a third more once encoded) would make saving fail, and keep failing while they stay attached.
  - Images over 1.2 MB, or over about 2560px, are now **shrunk to 2048px (long edge) JPEG at 85%** before being added (`obNotes.shotResizePlan`, unit-tested). Smaller images, like normal chart screenshots, are stored exactly as before.
  - If the browser can't decode a format (for example HEIC outside Safari), the original is kept.
  - Hint text on touch: "Tap + to take a photo or choose from your gallery".

## Step 5: Journal and Analytics · `87df7ab`
- **Journal:**
  - trades become cards: pair · direction · R / date · TF · session · result / strategy · rule status · Inspect;
  - filters two per row; search is 44px;
  - Net R / $ Equity toggle, mode switch, account chips and Reset are 44px.
- **Analytics filters:** two per row (previously seven full-width rows filled the whole screen); 44px.
- **Behavior:** Performance/Behavior tabs and the 7D/30D/90D/All pills are 44px.
- **Charts:** responsive, 200px tall on phones.
- **Insights card** ("System Discipline & Model Edge Insights"):
  - on phones it's a **collapsible section**, closed by default; tap the header or the 44px chevron;
  - always open on tablet and desktop.
- **Tables:** Strategy Comparison and all Psychology Status tables (By tag, By how it felt, Mistake leaderboard) **scroll inside their own cards**, with a soft edge shadow that shows there's more to the right.

## Step 6: Account center, Settings, MT5 · `bd8654a`
- **Account center:**
  - the section navigation was already a sideways-scrolling tab row (Part 3); it now **keeps the active section centred** (Security and Danger Zone used to sit cut off at the right);
  - forms single column (Part 3);
  - all tabs, buttons, fields and segment controls 44px, including its dialogs;
  - **Accounts list:** cards, with Edit / Rename / Archive / Account settings / Delete wrapping into even 44px rows.
- **Settings page:**
  - 44px fields and buttons;
  - the MT5 bridge card wraps instead of squeezing its text;
  - backup buttons stack full width.
- **MT5 panel on Trading:**
  - header stacks (it used to wrap "MT5 Integration — Real" into 3 lines);
  - "How to connect" and "Link MT5" are 44px and full width;
  - MT5 link and history dialogs capped to the visible screen.

## Step 7: AI Coach button; dialogs and dropdowns in bounds · `cd46e60`
- **AI Coach button:**
  - on phones and tablets it's **docked in the header next to the avatar** as a 44px icon, so it **never floats over content**. It used to cover form fields, the balance type switch and filters on most pages;
  - desktop keeps the floating button;
  - it's the same element and click handler, just moved;
  - signed out on phones it's hidden (the sign-in modal covers the page anyway).
- **Chat panel:** full screen on phones, safe areas, 44px ✕ / Add image / Send, keyboard-aware like the drawer.
- **Every dialog fits the visible screen and scrolls inside:**
  - strategy editor, delete strategy, daily limit, hard stop;
  - add/edit account, MT5 link/history;
  - Account center dialogs, sign-in.
  - Verified at 360×740 and 360×520.
- Dialog buttons are 44px.
- **Dropdowns:** bottom sheets on phones (Step 3); the desktop panel already flips and caps its height. The Dashboard filter and account menu are capped to the screen.

## Final walk at 390 and 360 (this commit)
- **Fixed:**
  - Account center tabs: the active section is centred;
  - profile card: long names no longer break mid-word, the email truncates cleanly, and "Edit Profile" sits full width below;
  - Home stats: "+23.50 R" no longer wraps the "R";
  - wallet card on Trading: ✎ and carousel arrows have 44px tap areas; "+ Add / Link" is 44px.

## Still imperfect / not done
1. **Not pushed (see the top). Nothing is live.**
2. **No real devices.** Everything was tested in emulated Chromium.
   - **iOS Safari** behaviour around the keyboard and the sticky bar is the riskiest part, because headless Chrome can't show an on-screen keyboard. Please test on your phone: open a trade, tap the note, type, and confirm the field stays visible and Save is reachable.
   - Also try a camera photo on iPhone and Android.
3. **Storage will still run out with photos. This is the big one.** All trades, *including every screenshot*, are saved as **one value with a 12 MB server limit**.
   - Shrinking photos stops a single trade from breaking saves, but a typical shrunk phone photo is still about 0.3–0.8 MB.
   - At 3 photos per trade, you'll hit the limit after **roughly 5–15 trades with photos**. Every save then fails.
   - The real fix is moving screenshots to file storage (Supabase Storage) and keeping only links in the trade. That's a backend change outside this round, but it should be next.
4. **Calendar cells are 37–41px wide at 360px.** 8 columns (7 days + week total) can't be 44px wide on a 328px-wide area. On touch screens the whole day cell is the tap target, and cells are ≥52px tall.
5. **Two controls look smaller than 44px but have 44px tap areas:** the wallet-card ✎ (32px) and the screenshot ✕ (32px). The automated check measures only the visible box, so it lists them; this is by design.
6. **Execution Log cards at 360px** can shorten "Trending" to "Trendi…" next to a long date/TF.
7. **Touch-screen rules aren't emulated in headless Chrome.** It never reports `pointer: coarse`, so tablets were tested through the width rules (≤1023px).
   - iPad landscape (1024px+) and touch laptops weren't walked. They get the 44px/16px rules through `pointer: coarse`, but nothing was verified there.
8. **Console errors on `/auth.html`** (`ui-rules.js`, `mt5-integration-ui.js`): from before this round, harmless, left as they were.
9. **Not exercised:** the Supabase path, real Google sign-in, Firefox.
