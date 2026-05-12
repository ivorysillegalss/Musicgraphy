import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api-error";
import {
  checkQRStatus,
  createQRImage,
  getQRKey,
  QR_STATUS,
} from "@/lib/netease";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, key } = body as { action?: string; key?: string };

    if (action === "key") {
      const { unikey } = await getQRKey();
      return NextResponse.json({ unikey }, { status: 200 });
    }

    if (action === "create") {
      if (!key) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "key is required" } },
          { status: 400 }
        );
      }
      const { qrurl, qrimg } = await createQRImage(key);
      return NextResponse.json({ qrurl, qrimg }, { status: 200 });
    }

    if (action === "check") {
      if (!key) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "key is required" } },
          { status: 400 }
        );
      }
      const result = await checkQRStatus(key);

      if (result.status === QR_STATUS.AUTHORIZED) {
        return NextResponse.json({
          status: QR_STATUS.AUTHORIZED,
          cookie: result.cookie,
        }, { status: 200 });
      }

      return NextResponse.json({ status: result.status }, { status: 200 });
    }

    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid action. Use: key, create, check" } },
      { status: 400 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
