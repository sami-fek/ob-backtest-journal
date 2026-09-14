#property strict
#property version   "1.0"
#property description "OB Journal read-only MT5 bridge. Never places, modifies, or closes trades."

input string InpEndpoint = "https://ob-backtest-journal.onrender.com/api/mt5/sync";
input string InpBridgeToken = "";
input int    InpSyncSeconds = 5;
input int    InpTimeoutMilliseconds = 10000;

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

string IsoTime(const long timestamp)
{
   if(timestamp <= 0)
      return "";
   return TimeToString((datetime)timestamp, TIME_DATE | TIME_SECONDS);
}

string BuildPositionJson(const int index)
{
   ulong ticket = PositionGetTicket(index);
   if(ticket == 0)
      return "";

   long type = PositionGetInteger(POSITION_TYPE);
   string direction = type == POSITION_TYPE_BUY ? "Buy" : "Sell";
   string symbol = PositionGetString(POSITION_SYMBOL);
   string comment = PositionGetString(POSITION_COMMENT);
   long magic = PositionGetInteger(POSITION_MAGIC);
   long openTime = PositionGetInteger(POSITION_TIME);

   return "{"
      + "\"ticket\":\"" + LongToString((long)ticket) + "\","
      + "\"symbol\":\"" + JsonEscape(symbol) + "\","
      + "\"direction\":\"" + direction + "\","
      + "\"volume\":" + DoubleToString(PositionGetDouble(POSITION_VOLUME), 2) + ","
      + "\"openTime\":\"" + IsoTime(openTime) + "\","
      + "\"openPrice\":" + DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), 8) + ","
      + "\"sl\":" + DoubleToString(PositionGetDouble(POSITION_SL), 8) + ","
      + "\"tp\":" + DoubleToString(PositionGetDouble(POSITION_TP), 8) + ","
      + "\"currentPrice\":" + DoubleToString(PositionGetDouble(POSITION_PRICE_CURRENT), 8) + ","
      + "\"profit\":" + DoubleToString(PositionGetDouble(POSITION_PROFIT), 8) + ","
      + "\"swap\":" + DoubleToString(PositionGetDouble(POSITION_SWAP), 8) + ","
      + "\"comment\":\"" + JsonEscape(comment) + "\","
      + "\"magic\":\"" + LongToString(magic) + "\""
      + "}";
}

string BuildPayload()
{
   string payload = "{"
      + "\"token\":\"" + JsonEscape(InpBridgeToken) + "\","
      + "\"login\":\"" + LongToString((long)AccountInfoInteger(ACCOUNT_LOGIN)) + "\","
      + "\"server\":\"" + JsonEscape(AccountInfoString(ACCOUNT_SERVER)) + "\","
      + "\"currency\":\"" + JsonEscape(AccountInfoString(ACCOUNT_CURRENCY)) + "\","
      + "\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 8) + ","
      + "\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 8) + ","
      + "\"positions\":[";

   bool first = true;
   for(int index = 0; index < PositionsTotal(); index++)
   {
      string position = BuildPositionJson(index);
      if(position == "")
         continue;
      if(!first)
         payload += ",";
      payload += position;
      first = false;
   }
   payload += "]}";
   return payload;
}

void SendSnapshot()
{
   if(StringLen(InpBridgeToken) < 10)
   {
      Print("[OB Journal] Bridge token is missing or too short.");
      return;
   }

   char requestData[];
   char responseData[];
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

int OnInit()
{
   if(StringLen(InpBridgeToken) < 10)
   {
      Print("[OB Journal] Set InpBridgeToken before attaching the EA.");
      return INIT_PARAMETERS_INCORRECT;
   }
   int interval = InpSyncSeconds < 1 ? 1 : InpSyncSeconds;
   EventSetTimer(interval);
   PrintFormat("[OB Journal] Read-only bridge started. Endpoint: %s", InpEndpoint);
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
