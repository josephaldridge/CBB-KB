import { NextResponse } from "next/server";
import { readKB, writeKB, isValidKB, checkPasscode } from "@/lib/kb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await readKB();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Could not read knowledge base", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  try {
    if (!checkPasscode(req)) {
      return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
    }
    const body = await req.json();
    if (!isValidKB(body)) {
      return NextResponse.json({ error: "Invalid data shape" }, { status: 400 });
    }
    const saved = await writeKB(body);
    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json(
      { error: "Could not save knowledge base", detail: String(err) },
      { status: 500 }
    );
  }
}
