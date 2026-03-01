import { NextRequest, NextResponse } from "next/server";
import { ChatMessage } from "@/lib/types";

interface OpenRouterChoice {
  message?: {
    content?: string;
  };
}

interface OpenRouterUsage {
  total_tokens?: number;
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  usage?: OpenRouterUsage;
  error?: {
    message?: string;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json()) as {
      model?: string;
      messages?: ChatMessage[];
      temperature?: number;
      maxTokens?: number;
    };

    if (!body.model || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: "Invalid payload. Expected model and non-empty messages." },
        { status: 400 }
      );
    }

    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_NAME ?? "Quorum"
      },
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        temperature: body.temperature ?? 0.7,
        max_tokens: body.maxTokens ?? 1200
      })
    });

    const json = (await openRouterResponse.json()) as OpenRouterResponse;

    if (!openRouterResponse.ok) {
      const message =
        json.error?.message ?? `OpenRouter request failed with status ${openRouterResponse.status}`;
      return NextResponse.json({ error: message }, { status: openRouterResponse.status });
    }

    const content = json.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return NextResponse.json(
        { error: "Model returned an empty response." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      content,
      tokenCount: json.usage?.total_tokens ?? 0
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
