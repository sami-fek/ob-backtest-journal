Status: Part 1: in progress · Part 2: not started · Part 3: not started · Part 4: not started

You are working on the MY Journal app. Repo: ob-backtest-journal (app code in OB-Backtest-Journal-READY/, front end in OB-Backtest-Journal-READY/public/). Current live state = main @ 6dd268a (Parts 1–4 + Mobile round done; read BUILD-PLAN.md, OVERNIGHT-REPORT-PART-4.md and OVERNIGHT-REPORT-MOBILE.md first).

HOW THIS BUILD WORKS (read first)
The work is split into 4 PARTS. Do ONE part at a time. When a part is finished, push everything, write the report, print "PART N DONE - check the live site, then tell me: next" and STOP completely. Do NOT start the next part until I write "next". I check the live site between parts and may add fixes: do those first, then wait again.
FIRST ACTION: run `git pull origin main`, save this whole prompt as BUILD-PLAN-2.md with a "Status" line at the top (Part 1: in progress), commit and push. Update the status line when each part finishes. If you are a new session with no memory, read BUILD-PLAN-2.md and ask me which part to continue.

RULES INSIDE A PART
- Do not stop to ask me anything inside a part. Make the best decision, note it in the report, keep going.
- One step at a time: implement, test, commit, `git push origin main`, then the next step. If a step cannot be done, skip it, write why, move on.
- The live site auto-deploys from main on Render: every push must leave the app working.
- Testing, every step:
  - `node --check` on every changed JS file; full test suite with Node 20 (`npx -y node@20 --test test/*.test.js` if the machine has another version).
  - Start the app locally and screenshot every changed screen in BOTH themes at 360, 390, 412, 430, 768 and 1440 px wide. Look at every screenshot before pushing.
  - IMPORTANT: real phones report `hover: none` and `pointer: coarse`; headless Chrome does NOT unless told. For every width under 1024 px, emulate touch media via the Chrome DevTools Protocol (Emulation.setEmulatedMedia with hover:none, any-hover:none, pointer:coarse, any-pointer:coarse) plus isMobile/hasTouch. A mobile test without this does not count (the last round missed a real bug this way).
  - Automated checks on every screen: no horizontal page scroll; nothing sticking out of the viewport; tap targets ≥ 44×44 px; text fields ≥ 16 px; nothing overlapping or hidden behind fixed elements.
  - Desktop regression: pages you did not intend to change must look the same at 1440 px (compare screenshots before/after).
- Do not break or weaken login, sessions, storage, the discipline engine (hard stop, daily limit), the save rules (Save needs ≥50% checklist + note + screenshot), MT5 or the AI Coach. Do not touch render.yaml or any secret. Backend (server.js) changes only where a step says so.
- Preserve every existing feature unless a step explicitly removes or moves it. UI_RESTORATION_LOCK.md still applies except where a step says otherwise.
- Honesty rules: never invent testimonials, reviews, user names or results; never claim a feature the app does not have; never name competitors; never copy another site's headlines, wording, logos or images.
- At the end of each part write OVERNIGHT-REPORT-P2-PART-N.md (per step: what changed, files, how tested, anything skipped or uncertain, and a list of anything still imperfect) and push it.

DESIGN REFERENCE (use as CSS variables; never hardcode colours in components)
- Keep the existing palette from BUILD-PLAN.md (dark page #0a0a0a, card #0f0f0f, raised #171717, borders #181818/#262626, text #fafafa, muted #7c8596, profit #22c55e, loss #ef4444; light page #ffffff, text #101729, muted #6b7280, profit #16a34a, loss #ef4444, blue #3b82f6).
- Main buttons are MONOCHROME: light theme black (#101729) with white text; dark theme white with near-black text. Secondary buttons: transparent with a thin border. No saturated blue buttons.
- "Log trade" actions (Add trade, Save trade, calendar "+" panel Save) are GREEN: the LONG/WIN green with slightly reduced contrast/saturation, readable in both themes. LONG/WIN/SHORT/LOSS toggles keep their current colours.
- Blue is an accent only (links, active tab, focus ring), not a button colour.
- Backgrounds on EVERY page: light = soft blue-white gradient (white → very light blue) with faint dashed grid lines and a few small circle/dot markers; dark = navy (#0b1220-ish) to near-black gradient with the same faint grid. Content sits on top; the background must never reduce text contrast.
- Typography: small labels, buttons and section tags in UPPERCASE monospace (JetBrains Mono) with letter spacing; headlines large and light/medium weight; numbers tabular monospace. One consistent scale everywhere.
- Fewer boxes: very faint borders (~6–8% opacity) or soft shadows instead of grey outlines; section titles ABOVE cards, not inside; one corner radius for cards and one for controls.

================ PART 1 OF 4: DESIGN SYSTEM + NEW DASHBOARD AND TRADING (SAMPLE) ================

STEP 1 - Design tokens and base styles
Add the design reference above as variables and base styles (buttons, secondary buttons, green log-trade button, backgrounds with grid, borders, radius, label/headline/number type styles, chart palette). Apply ONLY to the app shell (header, page background) in this step. Charts: softer green/red, thinner bars, gradient fill under lines, readable axes/tooltips in both themes.

STEP 2 - Dashboard restyled and restructured: "How am I doing, and am I safe?" (time frame: now)
Keep: greeting with Today's P&L / Trades / Wins, account equity, calendar, recent trades.
Add (only from data already stored):
- Progress bars towards the account's weekly and monthly profit targets (fields already exist in Account Settings); hide if no target is set.
- Funded/prop risk meters: max drawdown used and daily loss used vs the limits saved on the account (only for accounts that have those limits).
- Discipline status: consecutive losses vs the hard-stop number, trades today vs the daily limit.
- Current win/loss streak.
Move Profit Drivers and Performance Breakdown to Analytics (Part 2).
Every number shows its period ("today", "last 30 days", "all time").
Calendar: on touch screens there must be NO "+" circle in the day cells (it overlaps the dates on real phones); tapping anywhere on a day opens the add panel. Day cells tinted (no coloured outlines).

STEP 3 - Trading page restyled and restructured: "Can I trade right now, and how do I log it?" (time frame: this session)
- Top: a "Can I trade?" panel: trades left today (e.g. 2/3), losses left before the hard stop (e.g. 1/2), daily loss room left; green / amber / red state. Uses the existing discipline engine values; does not change the rules.
- Merge the mode switch, MT5 status and hard-stop/daily-limit banner into ONE slim toolbar strip.
- LOG A TRADE form (green Add trade button), then TODAY'S trades only, with a "Full history → Journal" link.
- MT5 open positions stay.
- Remove from Trading: calendar, Trading Activity heatmap, all-time KPI cards, Account Balance widget (their data stays available on Dashboard/Analytics).

STEP 4 - Mobile structure for these two pages
Design the phone layout deliberately (not just stacked desktop boxes): clear vertical rhythm, nothing condensed or overlapping, sensible grouping, comfortable spacing, no cramped multi-column rows on phones. Test at 360/390/412/430 with touch media.

STEP 5 - Review pack
Before/after screenshots of Dashboard and Trading in both themes at 1440 and 390 in the report. Then STOP (PART 1 DONE) so I can approve the look before it is rolled out.

================ PART 2 OF 4: ROLL OUT TO EVERY PAGE ================

STEP 1 - Analytics: "Why am I winning or losing?" (any period, in depth)
Restyle. Keep filters, charts by strategy/timeframe/regime/session/day, Strategy Comparison, Behavior tab. Receive Profit Drivers and Performance Breakdown from the Dashboard. Add (with unit tests for the calculations):
- Rules followed vs broken: win rate and average R for trades with checklist ≥ 50% vs < 50%.
- Performance after losses: results of the next trade after 1, 2 and 3 consecutive losses.
- R-multiple distribution (histogram).
- Drawdown chart (depth and duration).
- Sample-size warnings: under ~30 trades, label results as not yet reliable.

STEP 2 - Journal: "Review"
Restyle. Keep the trade list, notes, screenshots, filters, Discipline & Rules Status. Add a "Not reviewed yet" queue (trades with no checklist ticks or no note). Remove the duplicate equity chart (it lives in Analytics).

STEP 3 - Account center, Settings, trade drawer, calendar "+" panel, all dialogs, dropdowns/bottom sheets, account menu, AI Coach panel, sign-in page and modal: restyle to the design system.

STEP 4 - Mobile structure everywhere: same standard as Part 1 Step 4 for every page and overlay. Full sweep at all widths, both themes, touch media. Report every screen's result.

================ PART 3 OF 4: HOMEPAGE AND SIGN-IN FLOW ================

STEP 1 - Signed-out vs signed-in shell
- Signed out: header shows ONLY the logo + name on the left and one "Sign in" button on the right (opens the existing sign-in modal, which has "Create an account"). No app nav, no AI Coach button. The sign-in modal must NOT open automatically; visitors can read the homepage. Opening any app page while signed out opens the sign-in modal.
- Signed in: the app nav appears WITHOUT "Home"; "Get started" disappears; only the avatar (and the AI Coach button) on the right. The logo opens the Dashboard. After sign-in, land on the Dashboard (as now).
- Signed-in users never see the marketing homepage.

STEP 2 - Hero
Small badge pill; large headline with ONE highlighted word that cycles (e.g. "The journal that makes you respect your rules / risk / process" — write original copy, no "#1", no competitor names); one-line pitch; two buttons ("Get started" → sign-up, "See how it works" → scrolls to the next section); a real Dashboard screenshot in a browser-window frame on the right (stacked below on phones). Screenshots come from a DEMO account with demo data, light and dark versions matching the theme.

STEP 3 - "Why" section with pinned scroll animation
Centred section label + headline + one-line sub. Below: 3 numbered steps on the left with a vertical progress line that fills as you scroll; the active step is bright, others dimmed; the visual on the right changes per step:
 1. Log it honestly (Save needs checklist ≥50% + note + screenshot) — visual: stacked trade cards.
 2. Rules that stop you (hard stop, daily limit) — visual: the save requirement list / hard-stop state.
 3. See the pattern (Behavior: mistake leaderboard, FOMO %) — visual: the leaderboard/behavior chart.
Use position: sticky + a small scroll observer (no heavy animation library). Phones: no pinning, three stacked cards. Respect prefers-reduced-motion (no animation).

STEP 4 - Flow map with real screenshots
Section label + headline. 5 nodes, alternating left/right (screenshot in a browser frame + "NODE 0X · LABEL", title and one line of text), joined by a dotted connector line with small coloured markers:
 01 Log a trade (drawer + checklist) · 02 Dashboard & calendar · 03 Discipline engine · 04 Behavior & Analytics · 05 AI Coach (mention read-only MT5 sync only as what it is).
Only real features. Fade/slide in on scroll; phones: single column.

STEP 5 - "Sound familiar?" wall (no fake testimonials)
Same visual style as a testimonial wall (rows of cards, thin borders, small plus-shaped corner marks, faded edges, gentle horizontal drift). Each card: a common trader self-talk line (e.g. "I knew the rule. I broke it anyway.", "One more trade to win it back.") and a tag "Caught by: Hard stop / Daily limit / Save rules / Mistake leaderboard". NO names, NO personas, NO claims that these are users. Leave a clear place to swap in real reviews later.

STEP 6 - Closing call-to-action and footer disclaimer
Closing section: headline + "Get started" button. Footer: logo, short line, and a disclaimer: MY Journal is a journaling and analytics tool, not a broker, does not execute trades, and nothing in it is financial advice.

STEP 7 - Homepage QA: both themes, all widths, touch media, reduced motion, signed out and signed in; Lighthouse-style check that the page loads fast (lazy-load screenshots, sized images).

================ PART 4 OF 4: DATA AND SETTINGS FIXES ================
(Note: if I start logging trades with photos before Part 4, do Step 1 first.)

STEP 1 - Screenshot storage
Screenshots are currently stored inside the single trades record (server limit 12 MB) — this will break saving after a handful of trades with photos. Move screenshots to file storage (Supabase Storage on Render; local folder for the SQLite fallback); trades keep only references. Migrate existing embedded screenshots without data loss; keep the save rule ("at least one screenshot") working; keep export/import working. Backend changes allowed for this step. Tests for upload, migration and deletion.

STEP 2 - Preferences everywhere
Apply the currency symbol and date format from Account Settings to the older widgets that still show $ and YYYY-MM-DD (wallet card, calendars, Trading/Journal tables, Analytics, drawer).

STEP 3 - Timezone
Use the saved timezone for "today", the calendar day of a trade, daily limits and streaks, so trades near midnight land on the right day. Tests.

STEP 4 - Sign-in page console errors
Stop ui-rules.js and mt5-integration-ui.js from running on /auth.html (they log errors there). No behaviour change elsewhere.

STEP 5 - Final QA of the whole app (all pages, overlays, both themes, all widths, touch media) and the final report with everything still imperfect.

================ ADDENDUM: PAGE STRUCTURE / LAYOUT (read before starting; applies from Part 1 onward) ================

PROBLEM
Every page is squeezed into one narrow centred column (max-w-7xl container) and then split into many rounded rectangle boxes. On wide screens there are big empty side margins and the content feels trapped in the middle; on phones the boxes just stack on top of each other and feel cramped. It looks like a template, not a product.

GOAL
A real app layout that uses the screen properly, at every width, in both themes.

WHAT TO DO
1. App frame
   - Replace the single centred column with a proper app layout: the content area uses the available width (fluid), with comfortable side padding that grows with the screen (e.g. 16 px on phones, 24–32 px on tablets, 32–48 px on desktop).
   - Use a maximum readable width only where it helps (long text, forms); dashboards, tables, calendars and charts may use the full width up to a sensible cap (~1600 px) on very large screens.
   - The background (gradient + grid from the design reference) fills the whole viewport edge to edge, not just a box in the middle.
2. Sections instead of boxes
   - A page is a set of SECTIONS separated by space and a section title, not a stack of bordered rectangles.
   - Use a card only when it groups one set of data (a stat, a chart, a table). Do not wrap whole sections, toolbars, filters or headings in cards.
   - No card inside a card.
3. Grid
   - Use a consistent 12-column grid on desktop (e.g. 4/8, 6/6, 3/3/3/3 splits), 6 or 8 columns on tablets, 1 column (with occasional 2-up for small stats) on phones.
   - Related items line up on the same grid lines across sections; equal gaps everywhere (one spacing scale).
4. Phone structure (designed, not collapsed)
   - Decide the ORDER of content for phones per page (most important first), instead of simply stacking the desktop order.
   - Full-bleed sections where it helps (charts and calendars may span edge to edge with the side padding), no squeezed multi-column rows, no tiny text to make things fit.
   - Horizontal scrolling only inside components that need it (tables, heatmaps, tab rows), never the page.
5. Apply where
   - Part 1: build the app frame, spacing scale and grid in Step 1, and use them for the new Dashboard and Trading pages (Steps 2–4); include before/after screenshots at 1440, 1920, 768 and 390 in the review pack.
   - Part 2: apply the same structure to every other page and overlay (Analytics, Journal, Account center, Settings, drawer, dialogs).
   - Part 3: the homepage uses the same frame, spacing and grid.
6. Test
   - Add 1920 px to the test widths. Check that nothing is trapped in a narrow centre column on wide screens, nothing is cramped or overlapping on phones (with touch media), and the desktop pages still contain every feature.

This addendum does not change the order of the parts: still begin with PART 1 only and stop when Part 1 is done.
