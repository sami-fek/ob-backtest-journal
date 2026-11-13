# Plan 2 · Part 3 report: homepage and sign-in flow

All 7 steps are done and pushed to `main`. Steps 1–6 went into one commit because the header, homepage and sign-in flow depend on each other; Step 7 (QA) is its own commit.

## Commits
| Commit | Step |
|---|---|
| `a992401`, then the image fix in this commit (only the current theme's screenshots are downloaded; image sizes set) | 1–6 · Signed-out / signed-in shell, hero, pinned "Why", flow map, "Sound familiar?" wall, closing CTA, footer disclaimer, demo screenshots (+ Part 2 Step 4 cleanup) |
| (this commit) | 7 · QA, this report, the Part 2 report, status line |

## Step 1 · Signed-out vs signed-in shell
- **Signed out:**
  - The header shows only the logo and name (left) and one **Sign in** button (right), which opens the existing modal; the modal has "Create an account".
  - No app nav and no AI Coach button.
  - The **sign-in modal no longer opens by itself**, so visitors can read the homepage.
  - Opening an app page while signed out opens the sign-in modal, whether by a link like `/#analytics`, a nav call or the back button. The visitor stays on the homepage behind it.
- **Signed in:**
  - The nav has no **Home**, and **Get started** is gone.
  - On the right: the AI Coach button and the avatar.
  - The logo opens the Dashboard. After sign-in you land on the Dashboard, as before.
  - **Signed-in users never see the homepage:** any route to Home goes to the Dashboard.
- **How it works:**
  - `auth-check.js` reports the auth state (`window.obAuthState` and an `ob-auth-state` event) instead of opening the modal.
  - `site-shell.js` (new) sets `html.ob-signed-in` / `html.ob-signed-out`, guards `switchTab`, and handles the logo, **Sign in** and **Get started**.
  - `index.html` remembers the URL hash the visitor asked for before tab restore rewrites it.
  - Login, sessions and the auth API are unchanged.
- **Decision: Log out now goes to the homepage (`/`)** instead of `/auth.html`, so you land on the signed-out shell. `/auth.html` still works and was restyled in Part 2.
- `showAuthModal` gained an optional `{ mode: 'register' }`. The hero's **Get started** opens the modal on "Create an account"; **Sign in** opens it on Sign in.

## Step 2 · Hero
- **Pill:** "Trading journal · built around your rules".
- **Headline:** "The trading journal that keeps you to your **rules / risk limits / plan / process**". The highlighted word cycles every 2.6 s, and screen readers get the full list once.
- **Pitch:** "Log every trade with its checklist, a note and a screenshot. MY Journal stops you at your loss limits and shows which habits cost you R."
- **Buttons:** **Get started** (sign-up) and **See how it works** (scrolls to the next section).
- **Note under the buttons:** "Backtest, demo, live and funded accounts, each kept separate."
- **Screenshot:** a real Dashboard in a browser-window frame on the right, stacked below on phones. It's labelled "Demo data", in light and dark versions that follow the theme.
- **Copy rules followed:** the copy is original; there's no "#1", no competitors and no numbers presented as results.

## Step 3 · "Why" section with pinned scroll
- **Header:** label "Why it works", headline "Rules only help if something enforces them", sub "Three things happen every time you trade."
- **Desktop (≥ 1024 px):**
  - The block pins with `position: sticky` over 3 screens of scroll.
  - A small scroll listener (requestAnimationFrame-throttled, no library) picks the active step and fills the vertical progress line.
  - The active step is bright and the others dimmed. The visual on the right swaps per step:
    1. **Log it honestly:** the real trade sheet with checklist and save requirements, on stacked cards.
    2. **Rules that stop you:** the "Can I trade?" panel after a hard stop.
    3. **See the pattern:** the Mistake leaderboard.
- **Phones and tablets:** no pinning; three stacked cards, each with its visual.
- **Reduced motion:** no transitions.

## Step 4 · Flow map with real screenshots
- **Header:** label "The flow", headline "From one trade to the full picture".
- **Five nodes**, alternating left and right, joined by a dotted line with a coloured marker per node. Each has a screenshot in a browser frame, "NODE 0X · LABEL", a title and one line:
  - **01 Log a trade:** trade sheet and checklist.
  - **02 Dashboard & calendar.**
  - **03 Discipline engine:** the Trading page after a hard stop.
  - **04 Behavior & Analytics.**
  - **05 AI Coach.** MT5 is mentioned only as what it is: "Optional MT5 sync is read-only: it brings trades in and never places orders."
- **Motion:** nodes fade and slide in once on scroll (IntersectionObserver). Without JS, or with reduced motion, they're simply visible.
- **Phones and tablets:** single column, with the line and markers down the left.

## Step 5 · "Sound familiar?" wall
- **Layout:** two rows of thin-bordered cards with plus-shaped corner marks and faded edges. The rows drift gently in opposite directions and pause on hover.
- **Cards:** ten trader self-talk lines, each tagged "Caught by: Hard stop / Daily limit / Save rules / Mistake leaderboard". There are no names and no personas.
- **Honesty:** the sub-heading says plainly: "Things traders tell themselves… These are not reviews."
- **Place for real reviews later:** a comment in `index.html` marks it. Use the same `.hm-card` markup, the quote in `<q>`, the name in `.hm-card-tag`.

## Step 6 · Closing call to action and footer
- **Closing section:** "Start with your next trade" / "Trade your plan, not your mood." / **Get started**.
- **Footer** (every page, signed in or out): logo, "MY Journal · a trading journal built around your rules · © 2026", and the disclaimer: "MY Journal is a journaling and analytics tool. It is not a broker, it does not execute trades, and nothing in it is financial advice."
- **Removed from the footer:** "Built for Institutional Precision" and the storage note.

## Screenshots (demo account)
- **Where:** `public/home/*.webp`. There are 18 files, light and dark, 10–58 KB each, about 0.7 MB in total. Only the ones in view are downloaded.
- **How they were made:** taken from the local app with a throwaway **demo** account (profile name "Demo", accounts "Demo 100k" / "Demo account" / "Demo funded") and generated demo trades.
- **To retake them** after a design change: run the harness script `homeshots.mjs <public/home>` against a local server.

## Step 7 · QA
- **Unit tests (Node 20): 42/42.** `node --check` passes on every changed file.
- **Homepage sweep:** signed out, 7 widths × 2 themes, touch media under 1024. **Result: all 14 screens clean**: no sideways scroll, nothing sticking out, taps ≥ 44 px, nothing covered, and every visible screenshot loaded after scrolling. I re-ran 1440 and 390 in both themes after the last image change; still clean. I looked at the full-page shots at 390, 1440 and 1920. The tall empty band below the Why section in full-page captures is the pinned scroll distance, which isn't visible in a normal scroll.
- **Functional checks: `hfunc` 29/29.** One run in four failed the scroll-step check once (timing in the test: it waited 250 ms after a jump-scroll); it passed on the re-runs.
  - **Signed out:**
    - no modal on load; no nav or AI Coach; exactly one header button;
    - Sign in opens Sign in, Get started opens Create account;
    - "See how it works" scrolls to Why;
    - the active Why step follows the scroll (0 → 1 → 2), pinned on desktop;
    - `switchTab('journal')` and `/#analytics` open the modal over the homepage.
  - **Phones:** no pinning; three steps visible; flow map in one column.
  - **Reduced motion:** the wall doesn't drift, the hero word doesn't cycle, and nodes are visible without animation.
  - **Signed in:**
    - `/#home` goes to the Dashboard;
    - no Home, Sign in or Get started; avatar and AI Coach present;
    - the logo opens the Dashboard; the app tabs work.
- **App regression after the header change:**
  - Dashboard 13/13, Trading 17/17, Analytics 8/8, one page per tab: OK.
  - Full app sweep (84 screens) and overlay sweep: see the Part 2 report.
- **Load check** (local server, headless Chrome): - **Desktop:** DOM ready about 0.95 s, load about 1.7 s.
  - **Simulated slow mobile connection** (1.6 Mbit/s, 150 ms latency): DOM ready about 6.3 s, load about 9.1 s.
  - **Homepage images are not the weight problem.**
    - Only the current theme's images are downloaded. I first used light and dark image pairs hidden with CSS, but Chrome downloaded the hidden copies too, so the script now sets one source per slot.
    - Below-the-fold screenshots are lazy-loaded, every image has its width and height set, and the hero has a high fetch priority.
    - Up front, only the hero and the three Why images download (about 100 KB). The Why images sit within Chrome's lazy-load distance of the first screen.
  - **The weight is the app itself, about 1.5–1.7 MB in total:** Tailwind from the CDN, Chart.js, Font Awesome and the app scripts. They load for signed-out visitors too. Making the homepage fast on slow phones means not loading the app bundle until sign-in. That's a bigger change I didn't make in this part; see "Still imperfect".

## Still imperfect
0. **Homepage load on slow phones:** the signed-out homepage still loads the whole app (about 1.5 MB), so it takes about 9 s on a slow connection. The fix is to load the app scripts only after sign-in. Possible as a Part 4 extra; not done here.
1. **Brief flash for signed-out visitors:** a visitor who last used the app on this browser may glimpse the restored page for a moment, until the auth check answers and the homepage takes over. The page stays hidden while booting, so it's usually not visible.
2. **Screenshots are static:** after future design changes, retake them with `homeshots.mjs`.
3. **Why step 2 and 3 visuals** are crops of single panels. They're readable, but smaller than the step 1 visual.
4. **The header subtitle "Institutional Execution & Analytics Platform" and the "Pro OS" badge** are unchanged from before. You may want different wording now that there's a public homepage.
5. **Not tested:** real phones, Safari and Firefox, a real Lighthouse run, the live site.
