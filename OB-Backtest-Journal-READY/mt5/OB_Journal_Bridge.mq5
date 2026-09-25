#property strict
#property version   "2.0"
#property description "OB Journal read-only MT5 bridge. Sends open positions AND closed trade history. Never places, modifies, or closes trades."

input string InpEndpoint            = "https://ob-backtest-journal.onrender.com/api/mt5/sync";
input string InpBridgeToken         = "";
input int    InpSyncSeconds         = 5;
input int    InpTimeoutMilliseconds = 10000;
// How many days of closed-trade history to include on each sync.
// Keep this modest (30–90) to stay within the server's 12 MB request limit.
input int    InpHistoryDays         = 90;
// Maximum closed trades to include per sync (server cap is 5000 total stored).
input int    InpMaxClosedTrades     = 500;

// ─── string helpers ──────────────────────────────────────────────────────────

string JsonEscape(const string value)
{
   string escaped = value;
   StringReplace(escaped, "\\", "\\\\");
   StringReplace(escaped, "\"", "\\\"");
   StringReplace(escaped, "\r", "\\r");
   StringReplace(escaped, "\n", "\\n");
   StringReplace(escaped, "\t", "\\t");
   return escaped;
}

string IsoTime(const datetime timestamp)
{
   if(timestamp <= 0) return "";
   MqlDateTime dt;
   TimeToStruct(timestamp, dt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
      dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);
}

// ─── open positions ───────────────────────────────────────────────────────────

string BuildPositionJson(const int index)
{
   ulong ticket = PositionGetTicket(index);
   if(ticket == 0) return "";

   long   type      = PositionGetInteger(POSITION_TYPE);
   string direction = (type == POSITION_TYPE_BUY) ? "Buy" : "Sell";
   string symbol    = PositionGetString(POSITION_SYMBOL);
   string comment   = PositionGetString(POSITION_COMMENT);
   long   magic     = PositionGetInteger(POSITION_MAGIC);
   long   openTime  = (long)PositionGetInteger(POSITION_TIME);

   return "{"
      + "\"ticket\":\""    + LongToString((long)ticket) + "\","
      + "\"symbol\":\""    + JsonEscape(symbol)          + "\","
      + "\"direction\":\"" + direction                   + "\","
      + "\"volume\":"      + DoubleToString(PositionGetDouble(POSITION_VOLUME), 2) + ","
      + "\"openTime\":\""  + IsoTime((datetime)openTime) + "\","
      + "\"openPrice\":"   + DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), 8)    + ","
      + "\"sl\":"          + DoubleToString(PositionGetDouble(POSITION_SL), 8)            + ","
      + "\"tp\":"          + DoubleToString(PositionGetDouble(POSITION_TP), 8)            + ","
      + "\"currentPrice\":" + DoubleToString(PositionGetDouble(POSITION_PRICE_CURRENT), 8) + ","
      + "\"profit\":"      + DoubleToString(PositionGetDouble(POSITION_PROFIT), 8)        + ","
      + "\"swap\":"        + DoubleToString(PositionGetDouble(POSITION_SWAP), 8)          + ","
      + "\"comment\":\""   + JsonEscape(comment)                                          + "\","
      + "\"magic\":\""     + LongToString(magic) + "\""
      + "}";
}

// ─── closed trade history ─────────────────────────────────────────────────────

//  Strategy:
//  1. Select deal history for the last InpHistoryDays days.
//  2. Build a map of positionId -> IN-deal data (open price / open time).
//  3. For every OUT deal (closing deal), emit one closed-trade record.
//     Use DEAL_POSITION_ID as the stable ticket so the backend can dedup
//     across successive syncs.
//  4. Cap at InpMaxClosedTrades newest entries.

struct ClosedTrade
{
   string positionId;   // DEAL_POSITION_ID — used as ticket for dedup
   string symbol;
   string direction;
   double volume;
   string openTime;
   string closeTime;
   double openPrice;
   double closePrice;
   double profit;
   double swap;
   double commission;
   string comment;
};

string BuildClosedTradesJson()
{
   datetime fromTime = TimeCurrent() - (datetime)(InpHistoryDays * 86400);
   datetime toTime   = TimeCurrent() + 86400; // +1 day buffer

   if(!HistorySelect(fromTime, toTime))
   {
      Print("[OB Journal] HistorySelect failed.");
      return "[]";
   }

   int totalDeals = HistoryDealsTotal();
   if(totalDeals <= 0) return "[]";

   // Pass 1: collect IN-deal data keyed by position ID
   // (open price / open time for each position)
   // We store as parallel arrays using a simple linear-search approach.
   // MT5 doesn't offer maps natively in MQL5, so we use bounded arrays.
   const int MAX_POSITIONS = 2000;
   string  inPosId   [MAX_POSITIONS];
   double  inPrice   [MAX_POSITIONS];
   datetime inTime   [MAX_POSITIONS];
   int inCount = 0;

   for(int i = 0; i < totalDeals && inCount < MAX_POSITIONS; i++)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket == 0) continue;
      long entry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_IN) continue;
      long posId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
      inPosId[inCount] = LongToString(posId);
      inPrice[inCount] = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
      inTime [inCount] = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
      inCount++;
   }

   // Pass 2: collect OUT deals (closed trades)
   ClosedTrade outTrades[];
   int outCount = 0;

   for(int i = 0; i < totalDeals; i++)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket == 0) continue;
      long entry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT) continue;

      long   posId     = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
      string posIdStr  = LongToString(posId);
      long   dealType  = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
      // DEAL_TYPE_BUY = buy (closing a short), DEAL_TYPE_SELL = sell (closing a long)
      // The *position* direction is opposite to the closing deal direction.
      string direction = (dealType == DEAL_TYPE_BUY) ? "Sell" : "Buy";

      string symbol    = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
      double volume    = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
      datetime closeTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
      double closePrice  = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
      double profit      = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
      double swap        = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
      double commission  = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
      string comment     = HistoryDealGetString(dealTicket, DEAL_COMMENT);

      // Look up corresponding IN deal for open price / open time
      double openPrice  = 0.0;
      datetime openTime = 0;
      for(int j = 0; j < inCount; j++)
      {
         if(inPosId[j] == posIdStr)
         {
            openPrice = inPrice[j];
            openTime  = inTime[j];
            break;
         }
      }

      ArrayResize(outTrades, outCount + 1);
      outTrades[outCount].positionId  = posIdStr;
      outTrades[outCount].symbol      = symbol;
      outTrades[outCount].direction   = direction;
      outTrades[outCount].volume      = volume;
      outTrades[outCount].openTime    = IsoTime(openTime);
      outTrades[outCount].closeTime   = IsoTime(closeTime);
      outTrades[outCount].openPrice   = openPrice;
      outTrades[outCount].closePrice  = closePrice;
      outTrades[outCount].profit      = profit;
      outTrades[outCount].swap        = swap;
      outTrades[outCount].commission  = commission;
      outTrades[outCount].comment     = comment;
      outCount++;
   }

   if(outCount == 0) return "[]";

   // Cap: take the InpMaxClosedTrades most-recent (last in array = most recent)
   int startIdx = (outCount > InpMaxClosedTrades) ? (outCount - InpMaxClosedTrades) : 0;

   string json = "[";
   bool first = true;
   for(int i = startIdx; i < outCount; i++)
   {
      ClosedTrade ct = outTrades[i];
      if(!first) json += ",";
      first = false;
      json += "{"
         + "\"ticket\":\""     + JsonEscape(ct.positionId) + "\","
         + "\"symbol\":\""     + JsonEscape(ct.symbol)     + "\","
         + "\"direction\":\""  + ct.direction              + "\","
         + "\"volume\":"       + DoubleToString(ct.volume, 2) + ","
         + "\"openTime\":\""   + ct.openTime               + "\","
         + "\"closeTime\":\""  + ct.closeTime              + "\","
         + "\"openPrice\":"    + DoubleToString(ct.openPrice, 8)  + ","
         + "\"closePrice\":"   + DoubleToString(ct.closePrice, 8) + ","
         + "\"sl\":0,"
         + "\"tp\":0,"
         + "\"profit\":"       + DoubleToString(ct.profit, 8)     + ","
         + "\"swap\":"         + DoubleToString(ct.swap, 8)       + ","
         + "\"commission\":"   + DoubleToString(ct.commission, 8) + ","
         + "\"comment\":\""    + JsonEscape(ct.comment)           + "\""
         + "}";
   }
   json += "]";
   return json;
}

// ─── full payload ─────────────────────────────────────────────────────────────

string BuildPayload()
{
   // Open positions section
   string positionsJson = "[";
   bool firstPos = true;
   for(int index = 0; index < PositionsTotal(); index++)
   {
      string pos = BuildPositionJson(index);
      if(pos == "") continue;
      if(!firstPos) positionsJson += ",";
      positionsJson += pos;
      firstPos = false;
   }
   positionsJson += "]";

   // Closed trades section
   string closedJson = BuildClosedTradesJson();

   return "{"
      + "\"token\":\""    + JsonEscape(InpBridgeToken)                                    + "\","
      + "\"login\":\""    + LongToString((long)AccountInfoInteger(ACCOUNT_LOGIN))         + "\","
      + "\"server\":\""   + JsonEscape(AccountInfoString(ACCOUNT_SERVER))                 + "\","
      + "\"currency\":\"" + JsonEscape(AccountInfoString(ACCOUNT_CURRENCY))               + "\","
      + "\"balance\":"    + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 8)         + ","
      + "\"equity\":"     + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 8)          + ","
      + "\"margin\":"     + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN), 8)          + ","
      + "\"freeMargin\":" + DoubleToString(AccountInfoDouble(ACCOUNT_FREEMARGIN), 8)      + ","
      + "\"leverage\":"   + LongToString(AccountInfoInteger(ACCOUNT_LEVERAGE))            + ","
      + "\"positions\":"  + positionsJson                                                  + ","
      + "\"closedTrades\":" + closedJson
      + "}";
}

// ─── HTTP send ────────────────────────────────────────────────────────────────

void SendSnapshot()
{
   if(StringLen(InpBridgeToken) < 10)
   {
      Print("[OB Journal] Bridge token is missing or too short.");
      return;
   }

   char   requestData[];
   char   responseData[];
   string responseHeaders;
   string payload = BuildPayload();

   StringToCharArray(payload, requestData, 0, WHOLE_ARRAY, CP_UTF8);

   ResetLastError();
   int status = WebRequest(
      "POST",
      InpEndpoint,
      "Content-Type: application/json\r\n",
      InpTimeoutMilliseconds,
      requestData,
      ArraySize(requestData) - 1,
      responseData,
      responseHeaders
   );
   int errorCode = GetLastError();

   if(status == -1)
   {
      PrintFormat("[OB Journal] WebRequest failed. MT5 error=%d. Add the endpoint domain to Tools > Options > Expert Advisors > Allow WebRequest.", errorCode);
      return;
   }

   string response = CharArrayToString(responseData, 0, -1, CP_UTF8);
   if(status < 200 || status >= 300)
   {
      PrintFormat("[OB Journal] Server returned HTTP %d: %s", status, response);
      if(status == 401)
         Print("[OB Journal] Bridge token is invalid or revoked. Create a new link token in the journal.");
      return;
   }

   PrintFormat("[OB Journal] Read-only sync succeeded. HTTP %d: %s", status, response);
}

// ─── EA lifecycle ─────────────────────────────────────────────────────────────

int OnInit()
{
   if(StringLen(InpBridgeToken) < 10)
   {
      Print("[OB Journal] Set InpBridgeToken before attaching the EA.");
      return INIT_PARAMETERS_INCORRECT;
   }
   int interval = InpSyncSeconds < 1 ? 1 : InpSyncSeconds;
   EventSetTimer(interval);
   PrintFormat("[OB Journal] Read-only bridge v2.0 started. Endpoint: %s  History: %d days  Max closed: %d",
      InpEndpoint, InpHistoryDays, InpMaxClosedTrades);
   SendSnapshot();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   SendSnapshot();
}
