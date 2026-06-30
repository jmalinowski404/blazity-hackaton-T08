/* Single source of truth for the brand voice.
   The /api/check route builds its system prompt from this, and the UI renders
   the same rules — so what the user sees is exactly what gets enforced. */

export type BrandRule = {
  code: string;
  name: string;
  summary: string;
  prefer: string[];
  avoid: string[];
};

export const BRAND_PROFILE: { name: string; tagline: string; rules: BrandRule[] } = {
  name: "House voice",
  tagline: "Warm, plain-spoken, and specific. Sound like a person who knows the work.",
  rules: [
    {
      code: "TONE",
      name: "Tone",
      summary:
        "Warm, plain-spoken, and confident. Sound like a knowledgeable person, not a press release. No hype, no hard sell.",
      prefer: ["clear", "direct", "human"],
      avoid: ["thrilled", "revolutionary", "game-changing"],
    },
    {
      code: "VOCABULARY",
      name: "Vocabulary",
      summary:
        "Plain verbs over corporate ones. If a word only shows up in meetings, it doesn't ship.",
      prefer: ["use", "build", "help"],
      avoid: ["utilize", "leverage", "synergy", "empower", "ideate", "stakeholder"],
    },
    {
      code: "CLAIMS",
      name: "Claims",
      summary:
        "Be specific and concrete. No vague superlatives or unverifiable hype — say what it actually does.",
      prefer: ["concrete numbers", "what it does"],
      avoid: ["best-in-class", "world-class", "cutting-edge", "seamless"],
    },
    {
      code: "MECHANICS",
      name: "Mechanics",
      summary:
        "Sentence case for headings and buttons. One terminal punctuation mark. Use contractions and short sentences.",
      prefer: ["Sentence case", "one full stop"],
      avoid: ["Title Case", "!!!"],
    },
  ],
};

/** Build the system prompt the brand check runs against, from BRAND_PROFILE. */
export function buildSystemPrompt(): string {
  const rules = BRAND_PROFILE.rules
    .map(
      (r) =>
        `- ${r.name} (${r.code}): ${r.summary} Prefer: ${r.prefer.join(", ")}. Avoid: ${r.avoid.join(", ")}.`,
    )
    .join("\n");

  return `You are the brand-voice editor for a company whose house voice is defined below.
You review submitted copy and report every place it drifts off-brand.

# House voice — the brand guidelines you enforce
${rules}

# Your task
Given the user's copy, call the report_brand_check tool. For each off-brand passage provide:
- quote: the EXACT, VERBATIM substring copied from the text, character-for-character, so it can be located and highlighted. Keep it short — just the offending phrase.
- rule: the rule code it breaks, suffixed with a number, e.g. ${BRAND_PROFILE.rules
    .map((r) => `${r.code}-01`)
    .join(", ")}.
- title: a 2-4 word label for the issue.
- severity: low, medium, or high.
- explanation: one short sentence a non-expert can understand, saying what's off-brand and why it matters.
- rewrite: an on-brand replacement for just that passage.
Also provide:
- score: an integer 0-100 for how well the whole text fits the house voice (100 = perfectly on-brand).
- summary: one short sentence on the overall fit.
Report findings in the order they appear in the text. If the copy is already on-brand, return an empty findings array and a high score.`;
}
