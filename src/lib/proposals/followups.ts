export type FollowUpSequenceKey = "none" | "gentle" | "standard" | "persistent";

export type FollowUpStepTemplate = {
  delayDays: number;
  subject: string;
  body: string;
};

export type FollowUpSequenceOption = {
  key: FollowUpSequenceKey;
  label: string;
  description: string;
  steps: FollowUpStepTemplate[];
};

export const DEFAULT_PROPOSAL_SEND_MESSAGE =
  "I put this together based on what we talked about. Have a look when you can. Happy to adjust anything.";

export const FOLLOW_UP_SEQUENCES: FollowUpSequenceOption[] = [
  {
    key: "none",
    label: "No follow-ups",
    description: "Send the proposal once. No automated reminders.",
    steps: [],
  },
  {
    key: "gentle",
    label: "Gentle",
    description: "Two polite nudges if they haven’t decided yet.",
    steps: [
      {
        delayDays: 3,
        subject: "Quick check-in on the proposal",
        body: "Just floating this back up in case it got buried. Happy to clarify anything or adjust the scope if needed.",
      },
      {
        delayDays: 7,
        subject: "Still happy to help",
        body: "Wanted to check whether the proposal is still relevant. If timing isn’t right, no worries. I’m here when you’re ready.",
      },
    ],
  },
  {
    key: "standard",
    label: "Standard",
    description: "A balanced 3-step sequence most freelancers use.",
    steps: [
      {
        delayDays: 2,
        subject: "Did you get a chance to review?",
        body: "Following up on the proposal I sent. If anything is unclear or you’d like a quick call to walk through it, just reply to this email.",
      },
      {
        delayDays: 5,
        subject: "Any questions on the proposal?",
        body: "Checking in again in case you had questions on scope, timeline, or investment. I can revise anything that doesn’t quite fit.",
      },
      {
        delayDays: 10,
        subject: "Last note on the proposal",
        body: "I’ll keep this brief. The proposal is still open if you’d like to move forward. If not, feel free to ignore this and we can reconnect later.",
      },
    ],
  },
  {
    key: "persistent",
    label: "Persistent",
    description: "Faster cadence when a decision is time-sensitive.",
    steps: [
      {
        delayDays: 1,
        subject: "Proposal follow-up",
        body: "Sharing a quick nudge on the proposal. Open to a short call this week if that would help.",
      },
      {
        delayDays: 3,
        subject: "Checking in",
        body: "Wanted to make sure you had everything you need to decide. Happy to tweak deliverables or timing.",
      },
      {
        delayDays: 6,
        subject: "Shall we move ahead?",
        body: "If the proposal looks good, we can kick off as soon as it’s accepted. Otherwise tell me what’s blocking and I’ll adjust.",
      },
    ],
  },
];

export function getFollowUpSequence(key: FollowUpSequenceKey) {
  return (
    FOLLOW_UP_SEQUENCES.find((sequence) => sequence.key === key) ||
    FOLLOW_UP_SEQUENCES[0]
  );
}

export function fillFollowUpTemplate(
  template: string,
  vars: {
    recipientName?: string | null;
    senderName?: string | null;
    proposalTitle?: string | null;
  }
) {
  const recipient = vars.recipientName?.trim() || "there";
  const sender = vars.senderName?.trim() || "me";
  const title = vars.proposalTitle?.trim() || "the proposal";
  return template
    .replaceAll("{{recipientName}}", recipient)
    .replaceAll("{{senderName}}", sender)
    .replaceAll("{{proposalTitle}}", title);
}

export function buildScheduledFollowUps(options: {
  sequenceKey: FollowUpSequenceKey;
  steps?: FollowUpStepTemplate[];
  fromDate?: Date;
}) {
  const sequence = getFollowUpSequence(options.sequenceKey);
  const steps = options.steps ?? sequence.steps;
  const from = options.fromDate ?? new Date();

  return steps.map((step, index) => {
    const scheduled = new Date(from);
    scheduled.setHours(10, 0, 0, 0);
    scheduled.setDate(scheduled.getDate() + step.delayDays);
    return {
      stepIndex: index,
      delayDays: step.delayDays,
      subject: step.subject,
      body: step.body,
      scheduledFor: scheduled.toISOString(),
    };
  });
}
