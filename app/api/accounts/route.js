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
    if (!process.env.ACCOUNTS_DB_ID) return NextResponse.json({ error: "Missing ACCOUNTS_DB_ID" }, { status: 500 });

    const notion = new Client({ auth: process.env.NOTION_TOKEN });

    let results = [];
    let cursor = undefined;

    do {
      const resp = await notion.dataSources.query({
        data_source_id: process.env.ACCOUNTS_DB_ID,
        start_cursor: cursor,
        page_size: 100,
      });
      results = results.concat(resp.results);
      cursor = resp.has_more ? resp.next_cursor : undefined;
    } while (cursor);

    const accounts = results.map((page) => {
      const p = page.properties;
      return {
        id: page.id,
        name: nTitle(p["Name"]),
        status: nSel(p["Status"]),
        initial: nNum(p["Initial amount"]),
        added: nNum(p["Added amount"]),
        depositDate: nDate(p["Initial deposit"]),
      };
    });

    return NextResponse.json(accounts);
  } catch (e) {
    console.error("FULL ERROR:", e);
    return NextResponse.json(
      { error: "Failed to fetch accounts", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}