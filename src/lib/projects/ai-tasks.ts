import { asProposalContent } from "@/lib/proposals/content";

export type GeneratedProjectTask = {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
};

function fallbackTasksFromProposal(content: unknown): GeneratedProjectTask[] {
  const snapshot = asProposalContent(content as never);
  const tasks: GeneratedProjectTask[] = [];

  const deliverables = Array.isArray(snapshot.keyDeliverables)
    ? snapshot.keyDeliverables
    : [];
  for (const raw of deliverables.slice(0, 8)) {
    if (!raw || typeof raw !== "object") continue;
    const text = String(
      (raw as { text?: unknown; title?: unknown }).text ||
        (raw as { title?: unknown }).title ||
        ""
    ).trim();
    if (text) {
      tasks.push({
        title: text.slice(0, 120),
        description: "From proposal deliverables",
        priority: "medium",
      });
    }
  }

  const phases = Array.isArray(snapshot.timelinePhases)
    ? snapshot.timelinePhases
    : [];
  for (const raw of phases.slice(0, 5)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { title?: unknown; text?: unknown; detail?: unknown };
    const title = String(item.title || item.text || "").trim();
    if (!title) continue;
    tasks.push({
      title: title.slice(0, 120),
      description: String(item.detail || "From proposal timeline").slice(0, 400),
      priority: "medium",
    });
  }

  if (!tasks.length) {
    tasks.push(
      {
        title: "Kickoff & alignment",
        description: "Confirm goals, access, and success criteria.",
        priority: "high",
      },
      {
        title: "Delivery & review",
        description: "Produce agreed work and gather client feedback.",
        priority: "medium",
      },
      {
        title: "Handoff",
        description: "Final assets, docs, and wrap-up.",
        priority: "medium",
      }
    );
  }

  return tasks.slice(0, 12);
}

export async function generateProjectTasksFromProposal(input: {
  title: string;
  content: unknown;
}): Promise<GeneratedProjectTask[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return fallbackTasksFromProposal(input.content);

  const snapshot = asProposalContent(input.content as never);
  const brief = JSON.stringify({
    title: input.title,
    summary: snapshot.elementStyles?.["summary-text"],
    goals: snapshot.projectGoals,
    deliverables: snapshot.keyDeliverables,
    timeline: snapshot.timelinePhases,
    approach: snapshot.approachSteps,
  }).slice(0, 12000);

  const model =
    process.env.OPENAI_PROJECT_MODEL ||
    process.env.OPENAI_PROPOSAL_MODEL ||
    "gpt-4o-mini";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 1800,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Return JSON {"tasks":[{"title":string,"description":string,"priority":"low"|"medium"|"high"|"urgent"}]}. Create 5-10 actionable project tasks from the proposal. Titles under 80 chars. No fluff.',
          },
          {
            role: "user",
            content: `Proposal: ${input.title}\n\n${brief}`,
          },
        ],
      }),
    });

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    if (!res.ok) return fallbackTasksFromProposal(input.content);

    const parsed = JSON.parse(
      json.choices?.[0]?.message?.content || "{}"
    ) as { tasks?: unknown };
    if (!Array.isArray(parsed.tasks)) {
      return fallbackTasksFromProposal(input.content);
    }

    const tasks: GeneratedProjectTask[] = [];
    for (const item of parsed.tasks) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const title = String(row.title || "").trim();
      if (!title) continue;
      const priorityRaw = String(row.priority || "medium");
      const priority = (
        ["low", "medium", "high", "urgent"].includes(priorityRaw)
          ? priorityRaw
          : "medium"
      ) as GeneratedProjectTask["priority"];
      const description =
        String(row.description || "").trim().slice(0, 500) || undefined;
      tasks.push({
        title: title.slice(0, 120),
        description,
        priority,
      });
    }

    return tasks.length ? tasks.slice(0, 12) : fallbackTasksFromProposal(input.content);
  } catch {
    return fallbackTasksFromProposal(input.content);
  }
}
