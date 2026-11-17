# MYJournalLogger: the MT5 EA for MY Journal

`MYJournalLogger.mq5` sends each closed position, and the account's equity and balance every 30 seconds, to MY Journal. Closed trades arrive in the journal as **Not reviewed**.

**It only reads.** It never places, changes or closes an order or a position: there is no trading code in it at all. `OB_Journal_Bridge.mq5` in this folder is an old empty file and is not used.

The menu paths below are from `research/mt5-setup.md` in the Cowork research folder, checked against the official MetaTrader 5 help on 14 Nov 2026. Newer MT5 builds say "Algo Trading" where older help says "AutoTrading"; they are the same switch.

## Before you start

- **Hosting:** DEPLOY.md is done (the `mt5-ingest` function is deployed and migration 004 has run).
- **Not on Maven:** Maven bans EAs, so the app does not offer a key for a Maven account.
- **FundingPips:** get written confirmation from support before attaching it to a paid FundingPips account (DECISIONS.md, still open).
- **EA key:** in MY Journal, open the account, click **Link MT5**, and enter the MT5 login and server.
  - Copy the **EA key** it shows. It is shown once; the journal keeps only a fingerprint (SHA-256 hash).
  - Linking again makes a new key, and the old one stops working.
  - Unlinking stops it too.

## 1. Allow the journal's address

**Tools › Options** (Ctrl+O) **› Expert Advisors**:

1. Tick **Allow WebRequest for listed URL**.
2. Double-click the empty line under it and type exactly:

   ```text
   https://ynloihdiiahlegpkzhae.supabase.co
   ```

3. Press Enter, then **OK**.

## 2. Put the file in place

**File › Open Data Folder**, open `MQL5\Experts`, and copy `MYJournalLogger.mq5` into it.

## 3. Compile

Open MetaEditor (**F4**), open `MYJournalLogger.mq5`, and press **Compile** (**F7**).

- **Expected:** the Toolbox **Errors** tab must end with `0 errors`.
- **Checked here:** it compiled with `0 errors, 0 warnings` in MetaEditor 5 (64-bit) on 17 Nov 2026.

## 4. Attach it to one chart

1. Open any chart of the account, for example XAUUSD M15. The symbol does not matter: the EA reports the whole account.
2. **View › Navigator** (Ctrl+N) **› Expert Advisors**, then drag **MYJournalLogger** onto the chart.
3. **Common** tab: the EA does not need algorithmic trading, because it never trades. Leaving the box on is harmless.
4. **Inputs** tab: fill in the inputs below, then click **OK**.

| Input | What to put |
|---|---|
| `InpEaKey` | The EA key from Link MT5. Paste it; it is never written in the file. |
| `InpIngestUrl` | Leave as is: `https://ynloihdiiahlegpkzhae.supabase.co/functions/v1/mt5-ingest`. |
| `InpHeartbeatSec` | `30` (equity every 30 seconds; 30 to 300 allowed). |
| `InpHistoryDays` | `7`. On each start it re-sends positions closed in the last 7 days; the journal skips any it already has. |

- **One chart per account is enough.** A second chart on the same account doubles the requests but never the trades.
- **Running check:** the EA's name and icon appear in the chart's top right corner.

## 5. A healthy Experts tab

**View › Toolbox** (Ctrl+T) **› Experts**:

```text
MYJournalLogger: started on account 12345678 (Broker-Server). Read-only: it never places, changes or closes a trade. 0 trade(s) waiting from before.
MYJournalLogger: connected to MY Journal (account 12345678, server offset UTC+2.00h).
MYJournalLogger: position 987654321 closed; sending it to the journal.
MYJournalLogger: sent 1 closed trade(s). Journal answer: {"ok":true,"accountId":"funded-1","mode":"Funded","accepted":1,"duplicates":0,...
MYJournalLogger: heartbeat ok. Equity 10050.00, 0 trade(s) waiting.
```

The heartbeat line appears at most once every 10 minutes.

**When something is wrong:**

| Experts tab says | Meaning and fix |
|---|---|
| `InpEaKey is empty` | Paste the EA key into the Inputs tab (F7 on the chart). |
| `WebRequest is not allowed for this address` (error 4014) | Step 1: the address is missing or mistyped. |
| `the EA key was refused (HTTP 401)` | Wrong or old key. Link MT5 again and paste the new key. |
| `refused (HTTP 403): ... MT5_LOGIN_MISMATCH` | The key belongs to another MT5 login. Use the key made for this account. |
| `refused (HTTP 403): ... EAs not permitted by this firm` | A Maven account: remove the EA. |
| `no answer (error 5203)` or `-1` | No internet, wrong address, or the Supabase project is paused (DEPLOY.md › Troubleshooting). |
| `send failed ... trade(s) kept, next try in N s` | Nothing is lost. It retries after 30 s, 60 s, 120 s, and so on, up to every 10 minutes. |

## What it sends, and what it keeps

**Each request** (`POST` to `InpIngestUrl`, header `x-ea-key`):
- the login and server;
- the broker server time offset (server time minus UTC, from `TimeTradeServer()`/`TimeCurrent()`, rounded to 15 minutes);
- equity and balance;
- up to 100 closed positions.

**Each closed position:**
- **Dedup key:** the position ticket. A retry never creates a second journal row.
- **Fields:** symbol, buy or sell, volume, average open and close price, stop loss and take profit, profit, commission (with fees), swap, magic number and comment.
- **Times:** open and close, in UTC seconds.
- **Partial closes:** a partly closed position is sent once it is fully closed, with all its deals added together.

**Queue.** Positions not yet accepted are kept in `MQL5\Files\MYJournalLogger\queue_<login>.txt`, so they survive a dropped connection or an MT5 restart. Up to 5,000 are kept.

**Limits.**
- **Supabase calls:** one call every 30 seconds is about 86,400 calls a month per account. Supabase Free allows 500,000 a month, enough for about five accounts at 30 seconds.
- **Times on re-sent history:** a re-sent trade from before a daylight-saving change can show its time one hour off. It is still never duplicated, because the dedup key is the ticket.
