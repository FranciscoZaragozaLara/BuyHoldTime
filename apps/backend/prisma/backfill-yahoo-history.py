# Rellena bt_market_data con la historia diaria completa de Yahoo (no pisa filas existentes). Imprime SQL:
#   python3 prisma/backfill-yahoo-history.py VOO SCHD JEPQ SQQQ | docker exec -i buyholdtime-db psql -U postgres -d buyholdtime
# (period1/period2 explícitos: con range=max Yahoo devuelve datos mensuales.)
import json, sys, urllib.request
from datetime import datetime, timezone
out = []
for t in sys.argv[1:]:
    req = urllib.request.Request(f"https://query1.finance.yahoo.com/v8/finance/chart/{t}?interval=1d&period1=0&period2=9999999999", headers={"User-Agent": "Mozilla/5.0"})
    res = json.load(urllib.request.urlopen(req, timeout=30))["chart"]["result"][0]
    q = res["indicators"]["quote"][0]
    n = 0
    for i, ts in enumerate(res["timestamp"]):
        c = q["close"][i]
        if c is None: continue
        d = datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d")
        o, h, l, v = (q["open"][i] or c), (q["high"][i] or c), (q["low"][i] or c), int(q["volume"][i] or 0)
        out.append(f"('{t}-{d}','{t}','{d}',{o},{h},{l},{c},{c},{v},'yfinance',true)")
        n += 1
    print(f"{t}: {n} filas, desde {datetime.fromtimestamp(res['timestamp'][0], timezone.utc):%Y-%m-%d}", file=sys.stderr)
print("insert into bt_market_data (id,ticker,date,open,high,low,close,adj_close,volume,source,is_validated) values\n" + ",\n".join(out) + "\non conflict (ticker,date) do nothing;")
