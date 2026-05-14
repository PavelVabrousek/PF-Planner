import { NextResponse } from "next/server";
import {
  recalculatePortfolioData,
  type RecalculateProgressEvent,
} from "@/lib/recalculate/recalculate-portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "incremental" ? "incremental" : "full";
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  let isStreamOpen = true;

  const send = async (
    event: RecalculateProgressEvent | { type: "preparing"; message: string } | { type: "error"; error: string },
  ) => {
    if (!isStreamOpen) {
      return;
    }

    try {
      await writer.write(encoder.encode(`${JSON.stringify(event)}\n`));
    } catch {
      isStreamOpen = false;
    }
  };

  void (async () => {
    try {
      await send({
        type: "preparing",
        message: mode === "incremental" ? "Opening incremental market data stream" : "Opening market data stream",
      });
      await recalculatePortfolioData(send, mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown recalculation error";
      await send({ type: "error", error: message });
    } finally {
      if (isStreamOpen) {
        try {
          await writer.close();
        } catch {
          isStreamOpen = false;
        }
      }
    }
  })();

  return new NextResponse(readable, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
