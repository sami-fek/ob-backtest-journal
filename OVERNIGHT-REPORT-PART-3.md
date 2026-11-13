# Part 3 report: Account center (profile, accounts, account settings, security)

Part 3 is done. Both steps are pushed to `main`.

## How it was tested
- `node --check` on every changed JS file (and on the inline scripts of `index.html`).
- Test suite on Node 20: **25/25 pass**. New: `test/account.test.js` (backend, 2 tests) and `test/account-balance.test.js` (balance maths, 8 tests).
- Headless **Chrome** against the local app (SQLite, throwaway users):
  - A scripted functional run of every Account center flow: **42/42 checks pass** (listed under each section below).
  - Screenshots of all 6 sections in **light and dark** at **1440px and 390px**, plus the Journal equity toggle and the Google-only Security view. I looked at every one; problems I found are fixed (see "Fixed during testing").
  - A smoke test of the existing flows: LOG A TRADE still opens the drawer with nothing stored before Save, the Settings page still saves, and the wallet balance is unchanged.
- **Not tested:** the Supabase path (the code mirrors the existing SQLite/Supabase pattern, but only SQLite was run), real Google sign-in, real phones and Safari/Firefox, and the live site.

## Commits
| Commit | Step |
|---|---|
| `2a84aba` | Step 1: backend (change password, delete account) + tests |
| `a055c78` | Step 2: Account center UI, shared balance maths, cash movements |
| (this commit) | Report, theme inventory, BUILD-PLAN status |

---

## Step 1: Backend (`server.js`) · DONE · `2a84aba`
**`POST /api/auth/change-password`** `{ currentPassword, newPassword }`
- Needs a valid session.
- If the user has a password, the current one must match. A wrong one returns **401 `WRONG_PASSWORD`** ("Your current password is incorrect.") and the session stays valid.
- The new password needs at least 8 characters (`PASSWORD_TOO_SHORT`). It is bcrypt-hashed with cost 12, the same as register.
- Google-only users (no `password_hash`) can set a first password without `currentPassword`. The response says `passwordSet: true`.
- Extras: `CURRENT_PASSWORD_REQUIRED` and `PASSWORD_UNCHANGED` (new = current).

**`DELETE /api/auth/account`** `{ confirm: "DELETE", password? }`
- Needs a session and the exact text `DELETE`. If the user has a password, it must be given and correct.
- Deletes, in one SQLite transaction:
  - all of the user's kv rows;
  - the MT5 bridge-token records that point at this user (they live under a shared token session);
  - the user row.
- Then it clears the cookie.
- Supabase does the same with REST `DELETE` calls.

**`GET /api/auth/me`** now also returns `hasPassword` and `hasGoogle`. The Security section needs these to show "Signed in with Google". This is the only other backend change.

- No schema change and no SQL for you to run. Passwords are never logged; the tests check the server output for this.
- **Tests:**
  - change-password: no session; missing, wrong and short passwords; success; the old password stops working; the hash is bcrypt; a Google-only user sets a first password.
  - delete: no session; missing or wrong confirmation; missing or wrong password, after which nothing is deleted; success.
  - Other users' data is untouched: the other user's row, kv rows and MT5 token all stay. The old cookie stops working, and the email can register again with an empty account.

## Step 2: Account center · DONE · `a055c78`
**Files:**
- New: `public/account-center.js`, `public/account-center.css`, `public/account-balance.js`, `test/account-balance.test.js`.
- Changed: `public/index.html`, `public/ui-rules.js`, `public/account-widget-fix.js`, `public/journal-analytics-ui.js`, `public/auth-check.js`.

**Shell**
- Avatar menu → Profile / Accounts opens the Account center. It replaces the Part 1 stub; `openAccountCenter(section)` is the real function now.
- Layout:
  - a left sub-nav card: icon, title, one-line description and a blue marker on the active item;
  - the section title and a **Save Changes** button. Save shows only on Profile and Account Settings, where there is a form, and stays disabled until something changes.
- If you leave a section with unsaved changes, it asks first.
- The section header stays visible while you scroll, so Save is always reachable.
- On phones the sub-nav becomes a horizontal scrolling tab row.
- **Decision:** the center lives on the existing `accounts` route (`#accounts`). So `switchTab('accounts')`, saved tabs and back/forward keep working without touching the three scripts that hard-code the tab list. The old Accounts page content (the per-mode R cards) is now the "Performance by mode" card in the Accounts section. Nothing was dropped.

**1. Profile:** 42/42 run covers this.
- Big avatar, display name and @username, an "Edit Profile" button (jumps to the form), and Upload / Remove photo.
- Fields: first name, last name, email (read-only), username (3–30 characters: letters, numbers, `_` and `.`), phone, and About (max 1000).
- **Photo:** cropped to the centre and resized in the browser to **256×256 JPEG**, then stored as a data URL (max 150 KB; a 2000×1200 test image came out at 54 KB).
- **Storage:** the kv key `ob-profile`, via the existing storage API. This is per user, the same layer as settings.
- The header avatar and the name in the menu use the photo and name on every page load.

**2. Accounts:** add, edit, rename, archive or restore, delete, and "Use for <mode>".
- Each row shows a type badge, status, "In use", balance, return %, cash, broker, currency, trade count and limits.
- Fields: name, type (Real / Demo / Funded / Backtest), broker or prop firm, currency, starting balance, profit target, max drawdown, daily loss limit, active/archived.
- **Existing data:** the existing `my_journal_accounts_v1` record is used in the same shape; new fields are optional with defaults. MT5 fields on an account are kept on edit (tested). No migration step was needed.
- **Delete:**
  1. It asks whether to keep the account's trades unassigned or delete them.
  2. A confirm step.
  3. It deletes.
- **Unassigned trades:**
  - They get a flag so the old "assign to the first account" migration never re-assigns them (tested across a reload).
  - A card lists them and lets you move them to an account of the same mode.
- **Decisions:**
  - Demo, Real and Funded must each keep **one active account**, because the Trading page needs one. Archiving or deleting the last one is blocked with an explanation.
  - **The type can't be changed after creation.** An account's trades belong to its mode, so moving it would orphan them.
  - Archived accounts are hidden from the wallet carousel and the Journal account picker. Their trades are kept.
  - **Backtest accounts** are records only: Backtest trades were never split by account, so a Backtest account shows all Backtest trades.

**3. Account Settings:**
- **Balance:** you pick an account, then a balance type:
  - **Starting:** you type the starting balance.
  - **Current:** you type today's balance, and the starting balance is worked out so that start + trades + cash = what you typed (tested: €110,000.00 shown exactly).
- **Profit targets:** weekly and monthly, with progress bars for this week (Mon–Sun) and this month.
- **Cash movements:** Deposit or Withdraw, with date, amount and note.
  - They count **from their date on**: a future-dated one is listed as "upcoming" and isn't in the balance yet.
  - They change the wallet balance (tested +$5,000) and the equity curve.
  - They are not counted as trading return %.
  - They save immediately, as noted on the card.
- **Balance calculation:**
  - It is now in one shared module, `account-balance.js`: R × starting balance × risk % (unchanged), plus cash movements.
  - The wallet card and `ui-rules.js` both use it.
  - The calendar keeps its own (identical) R×$ maths, because it shows trade P&L, not balance.
- **Equity curve:** the Journal chart has a **Net R / $ Equity** toggle. Net R is the default and looks as before. $ Equity shows the account in dollars, including deposits and withdrawals on their date (labelled `+$` / `−$`).
- **Preferences:** timezone, currency symbol, date format, default risk %, default R:R.
  - Risk % and R:R are the **same setting** as on the Settings page (tested both directions). The daily limit, hard stop and Backtest capital are linked ("Settings page"), not duplicated.
  - **Fixed along the way:** the Settings page used to rewrite the settings record with only its own fields. It now keeps the extra fields, so the new preferences survive (tested).

**4. Security:**
- Sign-in methods: a "Signed in with Google" badge and Password set / No password yet.
- Change password, or **Set a password** for Google-only accounts (tested; afterwards the section switches to "Change password").
- Client checks: at least 8 characters and the two new passwords match. Server errors are shown as returned.

**5. Data:**
- **Export:** CSV (all trades, every mode; notes as plain text; quotes, commas and newlines escaped; cells starting with `=`, `+`, `-` or `@` are neutralised so a spreadsheet can't run them as formulas) and JSON (the full backup).
- **Import JSON:**
  - It validates the file and shows a summary first ("N found, X will be added, Y duplicates skipped, Z invalid skipped").
  - Nothing is stored until you press Import (tested: a file with 1 duplicate and 1 invalid record added exactly 2).
  - Duplicates by id are skipped and nothing is overwritten.
- The old Settings page export/import buttons still work as before.

**6. Danger Zone:**
- A red card listing exactly what is deleted, with a link to export first.
- The password is required if the account has one, and you type `DELETE`. The button stays disabled until both are done, then there's one last confirm.
- After the delete it clears this browser's cached copies of your data and goes to `/auth.html` (tested: the user is gone and no data from that user is left in the browser).

## Fixed during testing
- "In use" was missing when the browser had no stored account choice. It now uses the same first-account fallback as the rest of the app.
- At 390px the sub-nav row made the page wider than the screen. Fixed.
- The segmented controls were shorter than the inputs next to them. Fixed.
- The Save button scrolled under the sticky site header on long sections. The section header is now sticky.
- The "Export my data first" link was oversized. Fixed.

## Known / uncertain
- **Currency symbol and date format** are applied inside the Account center and exposed as `window.obPrefs` (`formatMoney`, `formatDate`). The existing widgets (wallet, calendar, KPIs) still show `$` and ISO dates; changing every widget was out of scope here. Part 4's Dashboard can use `obPrefs`. **Timezone** is stored but nothing uses it yet.
- **Deleting an account** that has an MT5 link removes the account. The server-side link record for that account id stays until you unlink it or delete your user account.
- **Pre-existing, not changed:** on `/auth.html`, `ui-rules.js` and `mt5-integration-ui.js` (injected on every page) log harmless console errors, and `ui-rules.js` writes default placeholder accounts to the browser cache.
- **Not exercised:** the Supabase delete path.
