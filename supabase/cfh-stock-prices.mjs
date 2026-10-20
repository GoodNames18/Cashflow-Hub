const asNumber = value => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object") {
    if (String(value.currency || value.code || "PHP").toUpperCase() !== "PHP") return null;
    return asNumber(value.amount ?? value.value ?? value.price);
  }
  return null;
};

export function parsePseStocksResponse(payload) {
  const rows = payload?.data?.stocks ?? payload?.stocks;
  if (!Array.isArray(rows)) throw new Error("Unexpected PSE stock response");
  const prices = new Map();
  for (const row of rows) {
    const symbol = String(row?.symbol || "").trim().toUpperCase();
    const price = asNumber(row?.price);
    if (!/^[A-Z0-9][A-Z0-9.\\-]{0,19}$/.test(symbol) || price === null || price < 0) continue;
    prices.set(symbol, { symbol, price, at: row.as_of || payload?.data?.as_of || payload?.as_of || null });
  }
  return prices;
}

export function liveStockQuoteRows(holdings, prices, at = new Date().toISOString()) {
  const rows = [];
  for (const holding of holdings) {
    const quote = prices.get(holding.symbol);
    if (!quote) continue;
    rows.push({
      kind: "quote",
      asset: "stock",
      broker: holding.broker,
      symbol: holding.symbol,
      price: quote.price,
      at
    });
  }
  return rows;
}
