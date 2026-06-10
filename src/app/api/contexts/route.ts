import { NextResponse } from "next/server";
import { listContexts } from "@/lib/k8s/client";
import { errorResponse } from "@/lib/k8s/registry-server";

export async function GET() {
  try {
    return NextResponse.json(listContexts());
  } catch (err) {
    return errorResponse(err);
  }
}
