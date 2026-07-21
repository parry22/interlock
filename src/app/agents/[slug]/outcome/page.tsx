"use client";

// Outcome-definition page for a chosen agent.
//
// The workflow context (agent = Interlock's connector + vertical) is fixed by the
// route, so the builder can ground everything in this agent's real fields.

import { use } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";

import { OutcomeDefinitionBuilder } from "@/components/OutcomeDefinitionBuilder";

export default function AgentOutcomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href={`/agents/${slug}`}
        className="inline-flex items-center gap-1.5 text-[12px] text-[#8a8a8a] hover:text-white transition-colors"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={13} color="currentColor" strokeWidth={1.5} />
        Back to agent
      </Link>
      <div className="mt-5">
        <OutcomeDefinitionBuilder agentSlug={slug} />
      </div>
    </div>
  );
}
