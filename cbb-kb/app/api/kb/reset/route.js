import { NextResponse } from "next/server";
import { getSeed, writeKB, checkPasscode } from "@/lib/kb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req) {
  try {
    if (!checkPasscode(req)) {
      return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
    }
    const fresh = getSeed();
    await writeKB(fresh);
    return NextResponse.json(fresh);
  } catch (err) {
    return NextResponse.json(
      { error: "Could not reset knowledge base", detail: String(err) },
      { status: 500 }
    );
  }
}
