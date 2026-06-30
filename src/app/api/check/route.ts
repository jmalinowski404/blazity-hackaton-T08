import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/app/brand";

const SYSTEM = buildSystemPrompt();

const INPUT_SCHEMA: Anthropic.Tool.InputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: {
      type: "integer",
      description: "0-100, how well the whole text fits the house voice (100 = perfect).",
    },
    summary: { type: "string", description: "One short sentence on the overall fit." },
    findings: {
      type: "array",
      description: "Off-brand passages, in the order they appear in the text.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          quote: {
            type: "string",
            description: "Exact verbatim substring copied from the submitted text.",
          },
          rule: { type: "string", description: "Rule code it breaks, e.g. VOCABULARY-01." },
          title: { type: "string", description: "2-4 word label for the issue." },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          explanation: {
            type: "string",
            description: "One plain sentence a non-expert understands: what's off-brand and why it matters.",
          },
          rewrite: { type: "string", description: "On-brand replacement for the quoted passage." },
        },
        required: ["quote", "rule", "title", "severity", "explanation", "rewrite"],
      },
    },
  },
  required: ["score", "summary", "findings"],
};

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY. Add it to .env.local and restart." },
      { status: 500 },
    );
  }

  let text: unknown;
  try {
    ({ text } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Provide some text to check." }, { status: 400 });
  }
  if (text.length > 50_000) {
    return NextResponse.json(
      { error: "That text is too long to check in one pass (50,000 character limit)." },
      { status: 413 },
    );
  }

  const client = new Anthropic();

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      system: SYSTEM,
      tools: [
        {
          name: "report_brand_check",
          description: "Report the brand-voice check: an alignment score plus the off-brand findings.",
          input_schema: INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "report_brand_check" },
      messages: [{ role: "user", content: text }],
    });

    const block = message.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return NextResponse.json({ error: "The model did not return a result." }, { status: 502 });
    }

    return NextResponse.json(block.input);
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Claude API error (${err.status ?? "?"}): ${err.message}` },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "Unexpected error running the check." }, { status: 500 });
  }
}
