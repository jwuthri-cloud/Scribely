import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // Check backend API health
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:8000";

    const response = await fetch(`${backendUrl}/api/v1/health/`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          status: "unhealthy",
          frontend: "ok",
          backend: "error",
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }

    const backendHealth = await response.json();

    return NextResponse.json({
      status: "healthy",
      frontend: "ok",
      backend: backendHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        frontend: "ok",
        backend: "unreachable",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
