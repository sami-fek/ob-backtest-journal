//+------------------------------------------------------------------+
//| MYJournalLogger.mq5                                               |
//| Read-only logger for MY Journal.                                  |
//|                                                                   |
//| Sends each closed position, and the account's equity and balance, |
//| to the mt5-ingest function of MY Journal. It NEVER places,        |
//| changes or closes an order or a position: it only reads.          |
//|                                                                   |
//| Setup: mt5/README.md                                              |
//+------------------------------------------------------------------+
#property copyright   "MY Journal"
#property version     "1.00"
#property description "Read-only: sends closed trades and equity to MY Journal."
#property description "Never places, changes or closes a trade."

//--- inputs (the EA key is pasted here by you; it is never written in this file)
input string InpEaKey       = "";   // EA key (MY Journal > Link MT5; shown once)
input string InpIngestUrl   = "https://ynloihdiiahlegpkzhae.supabase.co/functions/v1/mt5-ingest"; // mt5-ingest URL
input int    InpHeartbeatSec = 30;  // Send equity every N seconds (30 to 300)
input int    InpHistoryDays  = 7;   // On start, re-send positions closed in the last N days (the journal skips duplicates)

//--- limits
#define MAX_QUEUE      5000   // closed positions kept while the journal cannot be reached
#define BATCH_SIZE     100    // closed positions per request
#define HTTP_TIMEOUT   15000  // ms
#define MAX_BACKOFF    600    // seconds between retries at most

//--- state
string   g_queue[];           // JSON of closed positions not yet accepted by the journal
ulong    g_queued[];          // their position tickets (no position is queued twice)
string   g_queueFile = "";
string   g_key = "";
int      g_offsetMin = 0;     // broker server time minus UTC, in minutes
datetime g_nextSend = 0;      // next allowed send (backoff after a failure)
int      g_backoff = 0;       // current backoff in seconds
datetime g_lastOkPrint = 0;
datetime g_lastErrPrint = 0;
bool     g_connected = false;
int      g_every = 30;        // seconds between sends (InpHeartbeatSec, 30 to 300)

//+------------------------------------------------------------------+
//| Broker server time minus UTC, rounded to 15 minutes.             |
//| TimeTradeServer() is the server clock (TimeCurrent) kept running |
//| between ticks, so the offset is right on a quiet market too.     |
//+------------------------------------------------------------------+
int ServerOffsetMinutes()
  {
   datetime server = TimeTradeServer();
   if(server == 0)
      server = TimeCurrent();
   long diff = (long)server - (long)TimeGMT();
   int minutes = (int)MathRound((double)diff / 60.0 / 15.0) * 15;
   if(minutes > 14 * 60 || minutes < -14 * 60)
      minutes = 0;
   return minutes;
  }

//--- broker server time (deal times) -> UTC seconds
long ToUtc(datetime serverTime)
  {
   return (long)serverTime - (long)g_offsetMin * 60;
  }

//--- JSON helpers
string JsonEscape(string s)
  {
   string out = "";
   int n = StringLen(s);
   for(int i = 0; i < n; i++)
     {
      ushort c = StringGetCharacter(s, i);
      if(c == '"')
         out += "\\\"";
      else
         if(c == '\\')
            out += "\\\\";
         else
            if(c < 32)
               out += " ";
            else
               out += ShortToString(c);
     }
   return out;
  }

string Num(double v, int digits)
  {
   return DoubleToString(v, digits);
  }

//+------------------------------------------------------------------+
//| A closed position as one JSON object, built from all its deals.  |
//| Returns "" while the position is still (partly) open, or when it |
//| is not a buy/sell position.                                      |
//+------------------------------------------------------------------+
string ClosedPositionJson(ulong positionId)
  {
   if(positionId == 0)
      return "";
   if(PositionSelectByTicket(positionId))
      return "";   // still open (a partial close): sent once it is fully closed
   if(!HistorySelectByPosition(positionId))
      return "";

   int total = HistoryDealsTotal();
   string symbol = "", direction = "", comment = "";
   long magic = 0;
   datetime openTime = 0, closeTime = 0;
   double inVol = 0, inValue = 0, outVol = 0, outValue = 0;
   double profit = 0, commission = 0, swap = 0, sl = 0, tp = 0;
   int digits = 5;

   for(int i = 0; i < total; i++)
     {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0)
         continue;
      long type = HistoryDealGetInteger(deal, DEAL_TYPE);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL)
         continue;
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      datetime t = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
      double vol = HistoryDealGetDouble(deal, DEAL_VOLUME);
      double price = HistoryDealGetDouble(deal, DEAL_PRICE);
      profit     += HistoryDealGetDouble(deal, DEAL_PROFIT);
      commission += HistoryDealGetDouble(deal, DEAL_COMMISSION) + HistoryDealGetDouble(deal, DEAL_FEE);
      swap       += HistoryDealGetDouble(deal, DEAL_SWAP);
      if(symbol == "")
        {
         symbol = HistoryDealGetString(deal, DEAL_SYMBOL);
         digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
         if(digits <= 0)
            digits = 5;
        }
      if(entry == DEAL_ENTRY_IN)
        {
         if(openTime == 0 || t < openTime)
            openTime = t;
         if(direction == "")
            direction = (type == DEAL_TYPE_BUY) ? "buy" : "sell";
         inVol += vol;
         inValue += vol * price;
         if(sl == 0)
            sl = HistoryDealGetDouble(deal, DEAL_SL);
         if(tp == 0)
            tp = HistoryDealGetDouble(deal, DEAL_TP);
         magic = HistoryDealGetInteger(deal, DEAL_MAGIC);
         comment = HistoryDealGetString(deal, DEAL_COMMENT);
        }
      else
         if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY || entry == DEAL_ENTRY_INOUT)
           {
            if(t > closeTime)
               closeTime = t;
            outVol += vol;
            outValue += vol * price;
            if(sl == 0)
               sl = HistoryDealGetDouble(deal, DEAL_SL);
            if(tp == 0)
               tp = HistoryDealGetDouble(deal, DEAL_TP);
           }
     }
   if(direction == "" || closeTime == 0 || outVol <= 0)
      return "";

   string json = "{";
   json += "\"ticket\":\"" + IntegerToString((long)positionId) + "\"";
   json += ",\"symbol\":\"" + JsonEscape(symbol) + "\"";
   json += ",\"direction\":\"" + direction + "\"";
   json += ",\"volume\":" + Num(inVol > 0 ? inVol : outVol, 2);
   json += ",\"openTime\":" + IntegerToString(ToUtc(openTime > 0 ? openTime : closeTime));
   json += ",\"closeTime\":" + IntegerToString(ToUtc(closeTime));
   json += ",\"openPrice\":" + Num(inVol > 0 ? inValue / inVol : 0, digits);
   json += ",\"closePrice\":" + Num(outValue / outVol, digits);
   json += ",\"sl\":" + Num(sl, digits);
   json += ",\"tp\":" + Num(tp, digits);
   json += ",\"profit\":" + Num(profit, 2);
   json += ",\"commission\":" + Num(commission, 2);
   json += ",\"swap\":" + Num(swap, 2);
   json += ",\"magic\":\"" + IntegerToString(magic) + "\"";
   json += ",\"comment\":\"" + JsonEscape(comment) + "\"";
   json += "}";
   return json;
  }

//--- queue: one JSON object per line in MQL5\Files\MYJournalLogger\queue_<login>.txt
bool IsQueued(ulong positionId)
  {
   for(int i = 0; i < ArraySize(g_queued); i++)
      if(g_queued[i] == positionId)
         return true;
   return false;
  }

void SaveQueue()
  {
   int h = FileOpen(g_queueFile, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
     {
      Print("MYJournalLogger: could not save the queue file (error ", GetLastError(), "). Unsent trades stay in memory until MT5 closes.");
      return;
     }
   for(int i = 0; i < ArraySize(g_queue); i++)
      FileWriteString(h, g_queue[i] + "\n");
   FileClose(h);
  }

ulong TicketOf(string json)
  {
   int a = StringFind(json, "\"ticket\":\"");
   if(a < 0)
      return 0;
   a += 10;
   int b = StringFind(json, "\"", a);
   if(b < 0)
      return 0;
   return (ulong)StringToInteger(StringSubstr(json, a, b - a));
  }

void LoadQueue()
  {
   ArrayResize(g_queue, 0);
   ArrayResize(g_queued, 0);
   if(!FileIsExist(g_queueFile))
      return;
   int h = FileOpen(g_queueFile, FILE_READ | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
      return;
   while(!FileIsEnding(h))
     {
      string line = FileReadString(h);
      StringTrimLeft(line);
      StringTrimRight(line);
      if(StringLen(line) < 2)
         continue;
      ulong t = TicketOf(line);
      if(t == 0 || IsQueued(t))
         continue;
      int n = ArraySize(g_queue);
      ArrayResize(g_queue, n + 1);
      ArrayResize(g_queued, n + 1);
      g_queue[n] = line;
      g_queued[n] = t;
     }
   FileClose(h);
  }

bool Enqueue(ulong positionId)
  {
   if(IsQueued(positionId))
      return false;
   string json = ClosedPositionJson(positionId);
   if(json == "")
      return false;
   int n = ArraySize(g_queue);
   if(n >= MAX_QUEUE)
     {
      Print("MYJournalLogger: the queue is full (", MAX_QUEUE, " trades). Position ", positionId, " was not queued; fix the connection and restart the EA to re-send recent history.");
      return false;
     }
   ArrayResize(g_queue, n + 1);
   ArrayResize(g_queued, n + 1);
   g_queue[n] = json;
   g_queued[n] = positionId;
   SaveQueue();
   return true;
  }

void DropFirst(int count)
  {
   int n = ArraySize(g_queue);
   if(count <= 0)
      return;
   if(count >= n)
     {
      ArrayResize(g_queue, 0);
      ArrayResize(g_queued, 0);
     }
   else
     {
      for(int i = count; i < n; i++)
        {
         g_queue[i - count] = g_queue[i];
         g_queued[i - count] = g_queued[i];
        }
      ArrayResize(g_queue, n - count);
      ArrayResize(g_queued, n - count);
     }
   SaveQueue();
  }

//--- positions closed in the last InpHistoryDays days (the journal skips the ones it has)
void QueueRecentHistory()
  {
   int days = InpHistoryDays < 0 ? 0 : (InpHistoryDays > 90 ? 90 : InpHistoryDays);
   if(days == 0)
      return;
   datetime to = TimeCurrent() + 86400;
   if(!HistorySelect(to - (days + 1) * 86400, to))
      return;
   ulong ids[];
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0)
         continue;
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY && entry != DEAL_ENTRY_INOUT)
         continue;
      ulong pid = (ulong)HistoryDealGetInteger(deal, DEAL_POSITION_ID);
      bool seen = false;
      for(int k = 0; k < ArraySize(ids); k++)
         if(ids[k] == pid)
           {
            seen = true;
            break;
           }
      if(!seen)
        {
         int m = ArraySize(ids);
         ArrayResize(ids, m + 1);
         ids[m] = pid;
        }
     }
   int added = 0;
   for(int k = 0; k < ArraySize(ids); k++)
      if(Enqueue(ids[k]))
         added++;
   if(added > 0)
      Print("MYJournalLogger: ", added, " position(s) closed in the last ", days, " day(s) queued (the journal skips any it already has).");
  }

//+------------------------------------------------------------------+
//| One request: equity, balance and up to BATCH_SIZE closed trades. |
//+------------------------------------------------------------------+
void Send()
  {
   if(TimeLocal() < g_nextSend)
      return;
   g_offsetMin = ServerOffsetMinutes();
   int count = (int)MathMin(ArraySize(g_queue), BATCH_SIZE);

   string body = "{";
   body += "\"login\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\"";
   body += ",\"server\":\"" + JsonEscape(AccountInfoString(ACCOUNT_SERVER)) + "\"";
   body += ",\"serverOffsetMinutes\":" + IntegerToString(g_offsetMin);
   body += ",\"serverTime\":\"" + TimeToString(TimeTradeServer(), TIME_DATE | TIME_SECONDS) + "\"";
   body += ",\"equity\":" + Num(AccountInfoDouble(ACCOUNT_EQUITY), 2);
   body += ",\"balance\":" + Num(AccountInfoDouble(ACCOUNT_BALANCE), 2);
   body += ",\"deals\":[";
   for(int i = 0; i < count; i++)
      body += (i > 0 ? "," : "") + g_queue[i];
   body += "]}";

   char data[];
   int len = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0)
      ArrayResize(data, len - 1);   // drop the terminating zero
   char result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\nx-ea-key: " + g_key + "\r\n";

   ResetLastError();
   int status = WebRequest("POST", InpIngestUrl, headers, HTTP_TIMEOUT, data, result, resultHeaders);
   string answer = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);

   if(status == 200 && StringFind(answer, "\"ok\":true") >= 0)
     {
      if(count > 0)
         DropFirst(count);
      g_backoff = 0;
      g_nextSend = 0;
      if(!g_connected)
        {
         Print("MYJournalLogger: connected to MY Journal (account ", AccountInfoInteger(ACCOUNT_LOGIN), ", server offset UTC", (g_offsetMin >= 0 ? "+" : ""), DoubleToString(g_offsetMin / 60.0, 2), "h).");
         g_connected = true;
        }
      if(count > 0)
         Print("MYJournalLogger: sent ", count, " closed trade(s). Journal answer: ", StringSubstr(answer, 0, 200));
      else
         if(TimeLocal() - g_lastOkPrint >= 600)
           {
            Print("MYJournalLogger: heartbeat ok. Equity ", Num(AccountInfoDouble(ACCOUNT_EQUITY), 2), ", ", ArraySize(g_queue), " trade(s) waiting.");
            g_lastOkPrint = TimeLocal();
           }
      return;
     }

   // failure: keep everything queued and try again later (30 s, 60 s, 120 s, ... up to 10 min)
   g_connected = false;
   int err = GetLastError();
   g_backoff = g_backoff == 0 ? g_every : (int)MathMin(g_backoff * 2, MAX_BACKOFF);
   g_nextSend = TimeLocal() + g_backoff;
   if(TimeLocal() - g_lastErrPrint < 60 && status != 401 && status != 403)
      return;
   g_lastErrPrint = TimeLocal();
   string why;
   if(status == -1 && err == 4014)
      why = "WebRequest is not allowed for this address. Add " + InpIngestUrl + " (or its https://...supabase.co part) under Tools > Options > Expert Advisors > Allow WebRequest for listed URL.";
   else
      if(status == -1)
         why = "no answer (error " + IntegerToString(err) + "): no internet, wrong address, or the journal is paused.";
      else
         if(status == 401)
            why = "the EA key was refused (HTTP 401). Paste the key shown by MY Journal > Link MT5 into InpEaKey; linking again makes a new key.";
         else
            if(status == 403)
               why = "refused (HTTP 403): " + StringSubstr(answer, 0, 200);
            else
               why = "HTTP " + IntegerToString(status) + ": " + StringSubstr(answer, 0, 200);
   Print("MYJournalLogger: send failed, ", why, " ", ArraySize(g_queue), " trade(s) kept, next try in ", g_backoff, " s.");
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   g_key = InpEaKey;
   StringTrimLeft(g_key);
   StringTrimRight(g_key);
   if(g_key == "")
     {
      Print("MYJournalLogger: InpEaKey is empty. Paste the EA key from MY Journal > Link MT5 into the EA's Inputs tab.");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(StringFind(InpIngestUrl, "https://") != 0)
     {
      Print("MYJournalLogger: InpIngestUrl must start with https://");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(MQLInfoInteger(MQL_TESTER))
     {
      Print("MYJournalLogger: does nothing in the Strategy Tester (WebRequest is not available there).");
      return INIT_FAILED;
     }
   g_queueFile = "MYJournalLogger\\queue_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".txt";
   LoadQueue();
   g_offsetMin = ServerOffsetMinutes();
   Print("MYJournalLogger: started on account ", AccountInfoInteger(ACCOUNT_LOGIN), " (", AccountInfoString(ACCOUNT_SERVER), "). Read-only: it never places, changes or closes a trade. ",
         ArraySize(g_queue), " trade(s) waiting from before.");
   QueueRecentHistory();
   g_every = InpHeartbeatSec < 30 ? 30 : (InpHeartbeatSec > 300 ? 300 : InpHeartbeatSec);
   EventSetTimer(g_every);
   Send();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   if(g_queueFile != "")
      SaveQueue();
   Print("MYJournalLogger: stopped. ", ArraySize(g_queue), " trade(s) waiting; they are sent when the EA runs again.");
  }

void OnTimer()
  {
   Send();
  }

//--- a deal that closes (part of) a position: queue the position once it is fully closed
void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD || trans.deal == 0)
      return;
   if(!HistoryDealSelect(trans.deal))
      return;
   long entry = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY && entry != DEAL_ENTRY_INOUT)
      return;
   ulong pid = (ulong)HistoryDealGetInteger(trans.deal, DEAL_POSITION_ID);
   if(Enqueue(pid))
     {
      Print("MYJournalLogger: position ", pid, " closed; sending it to the journal.");
      g_nextSend = 0;   // send now, even during a backoff
      Send();
     }
  }
//+------------------------------------------------------------------+
