# Plan 2 · Part 1 report: design system, new Dashboard and Trading (sample)

All 5 steps are done and pushed to `main`. This is the sample for you to approve before Part 2 rolls the look out to every page.

## Commits
| Commit | Step |
|---|---|
| `c39f29d` | BUILD-PLAN-2.md saved |
| `4f13ae4` | 1 · Design tokens, base styles, app shell, chart palette |
| `f96b59b` | 2 · Dashboard restructured |
| `39ae682` | 3 · Trading page restructured |
| `9943e46` | 4 · Phone and tablet structure for both pages |
| (this commit) | 5 · Review pack, this report, status line |

## How it was tested
- **Code and unit tests:** `node --check` on every changed JS file. Test suite on Node 20: **37/37 pass** (2 new tests for the Dashboard calculations).
- **Screens:** local app (SQLite) in headless Chrome, with a throwaway user, 48 seeded trades and accounts that have targets and prop limits.
- **Widths and themes:** Dashboard and Trading at **360, 390, 412, 430, 768, 1440 and 1920 px**, light and dark, on a Live account and a Funded account with limits. That's 36 screens.
- **Touch emulation under 1024 px:** `Emulation.setEmulatedMedia` set to `hover:none`, `any-hover:none`, `pointer:coarse` and `any-pointer:coarse`, plus `isMobile`, `hasTouch` and touch emulation.
- **Automated checks on every screen:**
  - no sideways page scroll;
  - nothing sticking out of the viewport;
  - tap targets ≥ 44×44 px;
  - text fields ≥ 16 px;
  - no buttons or fields covered by fixed elements, sampled while scrolling the page.

  **Result: all screens clean.**
- **Functional scripts.** Dashboard **13/13**:
  - on touch, no "+" shows in calendar days, and tapping a day opens the add panel;
  - on desktop, "+" shows on hover;
  - the filter popover starts closed and stays open while you pick a filter;
  - Account equity equals the balance helper ($140,200.00 = $140,200.00);
  - targets show only when set;
  - Profit Drivers and Performance Breakdown show on Analytics › Performance and are hidden on Behavior;
  - Backtest shows the "no limits" note and no targets.

  Trading **17/17**:
  - the old blocks are hidden and the new order is right;
  - **Add trade** opens the trade sheet, and nothing is stored before Save;
  - the mode switch and the Funded daily-loss room work;
  - **Link MT5** opens its dialog;
  - delete from Today's trades works;
  - with 2 losses today the verdict is red, the strip says "Hard stop", and **the existing hard-stop dialog still blocks Add trade**;
  - with 3 trades today the verdict is red and the **server still reports the limit reached**;
  - with 1 loss the verdict is amber.
- **Desktop regression at 1440:** the commit before Part 1 ran side by side on a second local server with the same data. I pixel-compared the content area with a neutral background.
  - **Settings:** identical.
  - **Account center** and **Home:** identical except the random test email and a 1 px sub-pixel shift. The header is a few pixels shorter, which is an intended Step 1 change.
  - **Journal:** only the equity chart differs. It picks up the new chart style from Step 1, which applies to all charts on purpose.
  - **Analytics:** differs on purpose: the new chart style plus the two cards moved from the Dashboard.
- **Not tested:** real phones (iOS Safari, Android), Firefox, the Supabase storage path, and the live site.

## Review pack (Step 5)
**Before/after screenshots** are in [`review/plan2-part1/`](review/plan2-part1/).
- **Names:** `<page>-<before|after>-<theme>-<width>.jpg`. The pages are `dashboard` and `trading`, the themes `light` and `dark`, at widths 1440, 1920, 768 and 390. That's 32 images.
- **How they were taken:**
  - "Before" is the build just before Part 1 (`c39f29d`); "after" is this build. Both use the same demo data.
  - Under 1024 px, touch media is emulated.
  - These are JPEG at 70% quality, to keep the repo light.
- **Quick pairs to open:**

  | Page | Desktop | Phone |
  |---|---|---|
  | Dashboard | `dashboard-before-light-1440.jpg` → `dashboard-after-light-1440.jpg` | `dashboard-before-dark-390.jpg` → `dashboard-after-dark-390.jpg` |
  | Trading | `trading-before-light-1440.jpg` → `trading-after-light-1440.jpg` | `trading-before-light-390.jpg` → `trading-after-light-390.jpg` |

  The old Trading page on a phone was **8,289 px tall** (mostly the full execution log). The new one is about **2,200 px**.

---

## Step 1: Design system and app shell · `4f13ae4`
**Files:** new `public/design.css`; `public/theme.js` (chart plugin); `public/index.html` (stylesheet link).

**Tokens** (light and dark), all as CSS variables:
- **Text and lines:** text and muted; accent blue (links, active tab and focus only); profit, loss and warning, each with a soft tint; faint lines (~7% opacity).
- **Buttons:**
  - Main buttons are **monochrome**: near-black with white text in light, white with near-black text in dark.
  - Secondary buttons are transparent with a thin border.
  - The **log-trade button is green**: the WIN green, slightly softened. Light `#1d8a4c` with white text; dark `#2fb768` with near-black text.
- **Shapes and spacing:**
  - one card radius (16 px) and one control radius (10 px);
  - a spacing scale (4 → 64 px);
  - section gap: 40 px desktop, 32 px tablet, 28 px phone.
- **Type:**
  - labels, buttons and section tags in **uppercase JetBrains Mono** with letter spacing;
  - large light headlines;
  - tabular mono numbers;
  - a "period" tag style, so every number can say which period it covers.
- **Layout pieces:**
  - a 12-column grid that becomes 6 columns on tablets and 2 on phones (full width by default, 2-up only where a component asks for it);
  - meters, pills and a segmented control.

**App shell** (every page):
- **Background:** fills the whole viewport, edge to edge.
  - Light: white → very light blue.
  - Dark: navy `#0b1220` → near-black.
  - Both have a faint **dashed** 96 px grid and a few small dot and ring markers near the edges. It's a fixed layer behind everything, so text contrast is unchanged.
- **Header:** translucent with a faint line, and full width up to 1600 px.
  - The "PRO OS" badge and the tagline are mono labels.
  - "Get started" is now a monochrome main button. Part 3 removes it for signed-in users.
- **Footer:** transparent, with mono labels.

**App frame:**
- The content area is fluid up to **1600 px**, with gutters that grow with the screen: 16 px on phones, about 24 px on tablets, 43 px at 1440, 48 px at 1920.
- **Decision:** in Part 1 only the Dashboard and Trading use the fluid frame. The other pages keep their old centred column until Part 2, so they don't change before they're restyled.

**Charts** (all charts, through the existing Chart.js theme plugin):
- softer green and red;
- bars at most 18 px wide with small rounded tops;
- **gradient fill** under filled lines;
- rounded tooltips with more padding;
- no point dots by default;
- small round legend markers;
- the axes and tooltips keep the theme colours from the earlier work.

## Step 2: Dashboard: "How am I doing, and am I safe?" · `f96b59b`
**Files:**
- **Rewritten:** `public/dashboard.js` and `public/dashboard.css`.
- **New:** `public/analytics-drivers.js`.
- **Extended:** `public/dashboard-stats.js` (plus tests).
- **One addition** to `public/discipline-engine.js`.

**Layout (desktop).** Sections with their titles above the cards, on the 12-column grid:
1. **Greeting** with the date (mono label) and a large light headline. On the right are **P&L today, Trades today and Wins today**, shown without a box.
2. **Toolbar** (not a card): Live / Demo / Funded / Backtest, account, date range, Filter.
3. **Right now** (4/4/4):
   - **Account equity** "now", with an all-time equity sparkline;
   - **Discipline** "today": losses in a row vs the hard-stop number, and trades today vs the daily limit, each with a meter and "N left";
   - **Current streak** "all time": e.g. "5 wins", the last 12 results as coloured squares, and the longest win and loss streaks.
4. **Targets & limits**: only for accounts that have them; hidden otherwise.
   - **Weekly target** (this week, Monday–Sunday), **Monthly target** (this month) and **Profit target** (all time), each with progress and "$X to go".
   - Prop **Max drawdown used** (now) and **Daily loss used** (today) against the limits saved on the account, with the room left. The meter turns amber at 50% used and red at 80%.
5. **Performance** for the chosen range (with "· filtered" when a filter is on): **Net P&L, Win rate** (gauge), **Profit factor, Risk : reward**. Below them, the **Net P&L & account equity** chart at full width.
6. **Calendar** (7 columns) with month navigation in the section title, next to **Recent trades** (5 columns), now a compact list. Clicking a row opens the trade; 8 per page.
7. **Trading activity** (last 26 weeks). The squares grow with the available width, up to 24 px.

**Every number shows its period:** "now", "today", "this week", "this month", "all time" or the chosen range.

**Calendar** (shared component):
- day cells are **tinted** (green, red, or a faint neutral) with **no coloured outlines**;
- today is marked with a blue day number and a dot instead of an outline;
- on touch screens (`hover:none` or `pointer:coarse`) **the "+" circle isn't shown at all**. Tapping anywhere on the day opens the add panel; the hint text says "tap a day";
- on desktop, "+" still shows on hover.

**Moved:**
- **Profit Drivers** and **Performance Breakdown** now sit at the end of **Analytics › Performance**. They follow the analytics filters.
- They keep their current look until the Part 2 Analytics restyle.
- **Decision:** I moved them now rather than leaving them on the Dashboard until Part 2. That way you're approving the real new Dashboard, and nothing disappears in between.

**Definitions** (unit-tested in `test/dashboard-stats.test.js`):
- **Streak:**
  - trades ordered by date; same-day trades keep their logged order;
  - **a breakeven trade ends a streak**.
- **Max drawdown used:**
  - the drop from the highest point of the account's cumulative trade P&L to now, compared with the account's max-drawdown limit;
  - deposits and withdrawals are not counted, so a withdrawal never looks like a drawdown.
- **Daily loss used:** today's net loss, compared with the account's daily loss limit.

**Discipline numbers:**
- **The data:** these come from the discipline engine itself. It now also broadcasts its state as a read-only event (`ob-discipline-state`).
- **Rules and enforcement are unchanged.**

**Phones and tablets:**
- **Order:** greeting → today → controls → **Discipline first** → equity and streak → targets → performance → calendar → recent trades → activity.
- **On tablets:** Discipline is full width, with Equity and Streak side by side.

## Step 3: Trading: "Can I trade right now, and how do I log it?" · `39ae682`
**Files:**
- **New:** `public/trading-page.js` and `public/trading-page.css`.
- **Changed:**
  - `public/index.html`: section title above Log a trade, green **Add trade** button, ids on the retired blocks;
  - `public/trading-layout-step1.js`: one-line fix for the new wrapper;
  - `UI_RESTORATION_LOCK.md`: items 4 and 6 updated to the new Trading contract.

**Order:** toolbar strip → Can I trade? → Log a trade → Today's trades → MT5 open positions.
- **One slim toolbar strip** (not a card) replaces three blocks: the mode bar, the MT5 status panel and the hard-stop / daily-limit banner. It shows:
  - Live / Demo / Funded / Backtest;
  - **account picker** (with "+ Add account…");
  - **MT5 status** for the active account (Not linked / Linked / Synced and open positions), with **Link MT5**, or **History** and **Unlink** once linked, and **?** for "How to connect";
  - **rule status**:
    - red "Hard stop · N losses in a row" while the stop is active;
    - red "Daily limit · 3/3";
    - amber "2-loss rule hit on <date> · N trades logged after it" for an earlier hit (this is the old banner text);
    - otherwise green "Rules OK".
- **Can I trade?** A green, amber or red verdict with the reason, and three numbers:
  - **Trades left today** (e.g. 2 / 3);
  - **Losses left before the hard stop** (e.g. 1 / 2);
  - **Daily loss room left**. This uses the account's daily loss limit; without one it says "No daily loss limit on this account · Set one", which opens the account editor.

  The colours:
  - **Red:** the hard stop is active (same test as the Add trade gate: current losses in a row ≥ your number), the daily limit is reached, or there's no loss room left.
  - **Amber:** one loss or one trade left, or less than 25% of the loss room left.
  - **Green:** otherwise.

  It reads the discipline engine's values and **doesn't change or enforce anything**. Backtest shows "no limits apply".
- **Log a trade:** the same form, restyled.
  - mono labels, 40 px fields;
  - the LONG / SHORT and WIN / LOSS / BE toggles keep their colours;
  - **green Add trade**, which still opens the trade sheet (save rules unchanged).
- **Today's trades** for the active account:
  - side, pair, strategy · TF · session, rule status, P&L and R;
  - click to open, a delete button, and the day's net;
  - **Copy CSV** (same as before: all trades of the mode);
  - **Full history → Journal**.
- **MT5 open positions:** unchanged, with a quieter frame.
- **Removed from Trading:** calendar, Trading Activity heatmap, the four all-time KPI cards and the Account Balance widget.
  - **Decision:** they're hidden, not deleted. Several older scripts keep writing into them, and removing them would make those scripts throw.
  - Their data is on the Dashboard: calendar, activity, equity.

## Step 4: Phone structure for both pages · `9943e46`
- **Trading on phones:**
  - the modes as one full-width row;
  - the account picker;
  - MT5 status plus its buttons on one row;
  - the rule status on its own row;
  - the Can I trade? verdict on top, with the three numbers stacked (no 3-across);
  - the form as one column of 44 px controls;
  - Today's trades as cards (side · pair / strategy · rule status · P&L / R) with a 44 px delete.
- **Trading on tablets:**
  - the form has 3 fields per row with Add trade full width (the 5-across layout made WIN / LOSS / BE only 39 px wide);
  - the verdict sits above the three numbers.
- **Dashboard on phones:**
  - the "today" numbers sit between hairlines, not in a box;
  - Net P&L and Risk:Reward are full width, with Win rate and Profit factor side by side;
  - numbers never break mid-value.
- **Results:** all 360 / 390 / 412 / 430 / 768 checks pass with touch emulation (see "How it was tested").

---

## Still imperfect / not done
1. **Floating AI Coach button (desktop):** from 1024 px up, while scrolling, it can sit over the right edge of a card, e.g. the chart's period label at 1440. This is the existing floating button; phones and tablets already dock it in the header. It's restyled with the AI Coach panel in Part 2.
2. **Analytics cards still in the old look:** Profit Drivers and Performance Breakdown keep it until the Part 2 Analytics restyle.
3. **Old fixed column on other pages:** Journal, Analytics, Account center, Settings and Home still use it until Part 2. Only their header, background and charts changed.
4. **Hidden Trading blocks still render:** their scripts keep updating them out of sight (a little wasted work). Removing them safely means touching those scripts; better done in Part 2 or 4.
5. **MT5 in the strip shows only the active account.** To link another account, pick it in the account picker first. All accounts are also in the Account center.
6. **"Live" and "Real":** the Dashboard and Trading toolbars say "Live" for the Real mode, as before. Other pages still say "Real" until Part 2.
7. **Greeting name:** without a first name in your profile, it uses the part of your email before the @, as before.
8. **Background dots on phones:** the small markers sit under content there, because the gutters are narrow. They're faint and never cover text.
9. **Wide activity heatmap:** at 1920 it doesn't fill the full width; the squares stop growing at 24 px on purpose.
10. **Older Dashboard phone rules:** `mobile.css` still has rules for the old Dashboard table. They no longer match anything. I'll clean them up in Part 2.
11. **Preferences:** currency and date preferences apply on the Dashboard and Trading (new code). Older widgets wait for Part 4.
12. **Not exercised:** real devices, Safari / Firefox, Supabase, the live site.
