// POST /api/agents/match — natural-language task description → ranked agents.
//
// Scoring is intentionally simple for the hackathon: tokenize the task, count
// matches against each agent's tags / name / description with different
// weights, fold in track-record as a tiebreaker. The shape stays the same
// when we upgrade to embeddings later — just the score function changes.

import { NextRequest, NextResponse } from "next/server";

import { listAgents, type AgentListItem } from "@/lib/db/agents";

export const runtime = "nodejs";

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been",
  "being", "to", "of", "in", "on", "for", "with", "without", "by", "at", "from",
  "as", "into", "i", "we", "you", "they", "it", "this", "that", "these", "those",
  "my", "our", "your", "their", "its", "do", "does", "did", "have", "has", "had",
  "can", "could", "should", "would", "will", "shall", "may", "might", "must",
  "need", "want", "like", "some", "any", "all", "each", "every", "no", "not",
  "if", "then", "than", "so", "what", "which", "who", "whom", "where", "when",
  "why", "how",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function scoreAgent(agent: AgentListItem, tokens: string[]): {
  total: number;
  tagHits: string[];
  descHits: number;
} {
  const tags = (agent.taskTags as string[]).map((t) => t.toLowerCase());
  const name = agent.name.toLowerCase();
  const desc = agent.description.toLowerCase();
  let total = 0;
  const tagHits: string[] = [];
  let descHits = 0;
  for (const t of tokens) {
    if (tags.includes(t)) {
      total += 3;
      tagHits.push(t);
    } else if (tags.some((tag) => tag.includes(t))) {
      total += 2;
      tagHits.push(t);
    }
    if (name.includes(t)) total += 2;
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const occurrences = (desc.match(new RegExp(`\\b${escaped}`, "g")) ?? []).length;
    if (occurrences > 0) {
      total += occurrences;
      descHits += occurrences;
    }
  }
  return { total, tagHits, descHits };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { task?: string };
  try {
    body = (await req.json()) as { task?: string };
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${(e as Error).message}` }, { status: 400 });
  }
  const task = (body.task ?? "").trim();
  if (task.length < 5) {
    return NextResponse.json({ error: "describe your task in at least a few words" }, { status: 400 });
  }

  const tokens = tokenize(task);
  if (tokens.length === 0) {
    return NextResponse.json({ candidates: [], tokens: [] });
  }

  const agents = await listAgents({});
  const scored = agents
    .map((a) => {
      const score = scoreAgent(a, tokens);
      return { agent: a, score };
    })
    .filter((row) => row.score.total > 0)
    .sort((a, b) => {
      if (b.score.total !== a.score.total) return b.score.total - a.score.total;
      // Tiebreaker — more settled history wins.
      return b.agent.track.settledCount - a.agent.track.settledCount;
    });

  return NextResponse.json({
    candidates: scored.slice(0, 5),
    tokens,
  });
}
