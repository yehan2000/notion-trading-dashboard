import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";

export const runtime = "nodejs";

function nTitle(prop) {
  return prop?.title?.[0]?.plain_text ?? null;
}
function nNum(prop) {
  return typeof prop?.number === "number" ? prop.number : null;
}
function nSel(prop) {
  return prop?.select?.name ?? null;
}
function nDate(prop) {
  return prop?.date?.start ?? null;
}

export async function GET() {
  try {
    if (!process.env.NOTION_TOKEN) return NextResponse.json({ error: "Missing NOTION_TOKEN" }, { status: 500 });
    if (!process.env.TRADES_DB_ID) return NextResponse.json({ error: "Missing TRADES_DB_ID" }, { status: 500 });

    const notion = new Client({ auth: process.env.NOTION_TOKEN });

    let results = [];
    let cursor = undefined;

    do {
      const resp = await notion.dataSources.query({
        data_source_id: process.env.TRADES_DB_ID,
        start_cursor: cursor,
        page_size: 100,
      });
      results = results.concat(resp.results);
      cursor = resp.has_more ? resp.next_cursor : undefined;
    } while (cursor);

    const trades = results.map((page) => {
      const p = page.properties;
      return {
        id: page.id,
        name: nTitle(p["No trade"]),
        date: nDate(p["Trade Date"]),
        pair: nSel(p["Pair"]),
        direction: nSel(p["BUY/SELL"]),
        lot: nNum(p["Lot"]),
        pnl: nNum(p["Profit/Loss"]),
        commission: nNum(p["Commission"]),
        outcome: nSel(p["Trade outcome"]),
        setup: nSel(p["Setup"]),
        sl: nNum(p["Stop Loss"]),
        tp: nNum(p["Take Profit"]),
      };
    });

    return NextResponse.json(trades);
  } catch (e) {
    console.error("GET /api/trades error:", e);
    return NextResponse.json(
      { error: "Failed to fetch trades", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    if (!process.env.NOTION_TOKEN) return NextResponse.json({ error: "Missing NOTION_TOKEN" }, { status: 500 });
    if (!process.env.TRADES_DB_ID) return NextResponse.json({ error: "Missing TRADES_DB_ID" }, { status: 500 });

    const notion = new Client({ auth: process.env.NOTION_TOKEN });
    const body = await request.json();
    const { date, pair, direction, lot, pnl, commission, outcome, setup, sl, tp } = body;

    const properties = {
      "No trade": {
        title: [{ text: { content: `Trade ${new Date().toLocaleDateString("fr-FR")}` } }],
      },
    };

    if (pair) properties["Pair"] = { select: { name: pair } };
    if (direction) properties["BUY/SELL"] = { select: { name: direction } };
    if (outcome) properties["Trade outcome"] = { select: { name: outcome } };
    if (setup) properties["Setup"] = { select: { name: setup } };
    if (lot != null) properties["Lot"] = { number: parseFloat(lot) };
    if (pnl != null) properties["Profit/Loss"] = { number: parseFloat(pnl) };
    if (commission != null) properties["Commission"] = { number: parseFloat(commission) };
    if (sl != null) properties["Stop Loss"] = { number: parseFloat(sl) };
    if (tp != null) properties["Take Profit"] = { number: parseFloat(tp) };
    if (date) properties["Trade Date"] = { date: { start: date } };

    const page = await notion.pages.create({
      parent: { database_id: process.env.TRADES_DB_ID },
      properties,
    });

    return NextResponse.json({ success: true, id: page.id });
  } catch (e) {
    console.error("POST /api/trades error:", e);
    return NextResponse.json(
      { error: "Failed to create trade", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
