export type ReminderSequenceKey = "none" | "gentle" | "standard" | "persistent";

export type ReminderStepTemplate = {
  /** Days relative to due date. Negative = before due, 0 = due day, positive = overdue. */
  offsetDays: number;
  subject: string;
  body: string;
};

export type ReminderSequenceOption = {
  key: ReminderSequenceKey;
  label: string;
  description: string;
  steps: ReminderStepTemplate[];
};

export const REMINDER_SEQUENCES: ReminderSequenceOption[] = [
  {
    key: "none",
    label: "No reminders",
    description: "Send the invoice once. No automated payment nudges.",
    steps: [],
  },
  {
    key: "gentle",
    label: "Gentle",
    description: "A light touch before due, then a few polite nudges after.",
    steps: [
      {
        offsetDays: -1,
        subject: "Friendly heads-up — invoice due tomorrow",
        body: "Just a quick note that your invoice is due tomorrow. Whenever you’re ready, you can pay via the link below. Thanks!",
      },
      {
        offsetDays: 3,
        subject: "Quick reminder on your invoice",
        body: "Hope you’re well. Circling back on the invoice in case it slipped through. Happy to answer any questions.",
      },
      {
        offsetDays: 10,
        subject: "Checking in on payment",
        body: "Wanted to gently follow up on the open invoice. If timing is tight or something looks off, just reply and we’ll sort it out.",
      },
      {
        offsetDays: 21,
        subject: "Still open — no rush, just a note",
        body: "This invoice is still outstanding. No pressure — when you’re ready, the payment link is below. Happy to help if you need anything.",
      },
    ],
  },
  {
    key: "standard",
    label: "Standard",
    description: "Nudge before due, then a clear overdue sequence that stays polite.",
    steps: [
      {
        offsetDays: -2,
        subject: "Invoice due in 2 days",
        body: "A friendly reminder that your invoice is due in a couple of days. You can review and pay anytime with the link below.",
      },
      {
        offsetDays: 2,
        subject: "Reminder: invoice is past due",
        body: "Just following up — this invoice is a couple of days past due. If you’ve already paid, thank you (and feel free to ignore this). Otherwise the link below takes you straight to payment.",
      },
      {
        offsetDays: 7,
        subject: "Following up on your invoice",
        body: "Checking in again on the outstanding invoice. If there’s a question about the amount or details, reply to this email and I’ll help right away.",
      },
      {
        offsetDays: 14,
        subject: "Invoice still open — can we help?",
        body: "This invoice remains unpaid. I’d love to close it out when you’re able. If something’s blocking payment, tell me and we can find a path forward.",
      },
      {
        offsetDays: 28,
        subject: "Final note on this invoice",
        body: "I’ll keep this brief. The invoice is still open if you’d like to settle it. The payment link is below — and I’m here if you need anything adjusted.",
      },
    ],
  },
  {
    key: "persistent",
    label: "Persistent",
    description: "Tighter cadence when cash flow matters — still professional and kind.",
    steps: [
      {
        offsetDays: -2,
        subject: "Upcoming invoice due date",
        body: "Your invoice is due in two days. Paying early is always appreciated — the link below makes it quick.",
      },
      {
        offsetDays: 0,
        subject: "Invoice due today",
        body: "Friendly reminder that your invoice is due today. You can pay securely via the link below whenever it works for you.",
      },
      {
        offsetDays: 2,
        subject: "Invoice overdue — quick nudge",
        body: "This invoice is now a few days past due. If payment is already on the way, thank you. If not, the link below is ready when you are.",
      },
      {
        offsetDays: 5,
        subject: "Checking in on overdue invoice",
        body: "Following up on the overdue invoice. Happy to hop on a quick call or clarify anything that might be holding things up.",
      },
      {
        offsetDays: 10,
        subject: "Please settle this invoice when you can",
        body: "I’d appreciate an update on this outstanding invoice. You can pay online below, or reply if you need a different arrangement.",
      },
      {
        offsetDays: 18,
        subject: "Important: invoice still unpaid",
        body: "This is an important follow-up on an unpaid invoice. Please use the link below to pay, or reply so we can resolve this together.",
      },
    ],
  },
];

export function getReminderSequence(key: ReminderSequenceKey) {
  return (
    REMINDER_SEQUENCES.find((sequence) => sequence.key === key) ||
    REMINDER_SEQUENCES[0]
  );
}

export function formatReminderOffsetLabel(offsetDays: number) {
  if (offsetDays === 0) return "Due day";
  if (offsetDays < 0) {
    const n = Math.abs(offsetDays);
    return n === 1 ? "1 day before due" : `${n} days before due`;
  }
  return offsetDays === 1 ? "1 day after due" : `${offsetDays} days after due`;
}

function parseDueDateLocal(dueDate: string) {
  const [y, m, d] = dueDate.split("-").map(Number);
  if (![y, m, d].every((n) => Number.isFinite(n))) return null;
  // Schedule at 10:00 local (matches proposal follow-up scheduling style).
  return new Date(y, m - 1, d, 10, 0, 0, 0);
}

export function buildScheduledReminders(options: {
  sequenceKey: ReminderSequenceKey;
  steps?: ReminderStepTemplate[];
  dueDate: string;
  fromDate?: Date;
}) {
  const sequence = getReminderSequence(options.sequenceKey);
  const steps = options.steps ?? sequence.steps;
  const due = parseDueDateLocal(options.dueDate);
  if (!due || steps.length === 0) return [];

  const from = options.fromDate ?? new Date();
  const minSchedule = new Date(from.getTime() + 30 * 60 * 1000);

  const scheduled = steps.map((step, index) => {
    const at = new Date(due);
    at.setDate(at.getDate() + step.offsetDays);
    return {
      stepIndex: index,
      offsetDays: step.offsetDays,
      subject: step.subject,
      body: step.body,
      scheduledFor: at,
    };
  });

  const future = scheduled.filter((step) => step.scheduledFor > minSchedule);

  // If the invoice is already past every step, still send the last nudge soon.
  if (future.length === 0) {
    const last = scheduled[scheduled.length - 1];
    const soon = new Date(from);
    soon.setHours(10, 0, 0, 0);
    if (soon <= minSchedule) {
      soon.setDate(soon.getDate() + 1);
    }
    return [
      {
        stepIndex: last.stepIndex,
        offsetDays: last.offsetDays,
        subject: last.subject,
        body: last.body,
        scheduledFor: soon.toISOString(),
      },
    ];
  }

  return future.map((step) => ({
    stepIndex: step.stepIndex,
    offsetDays: step.offsetDays,
    subject: step.subject,
    body: step.body,
    scheduledFor: step.scheduledFor.toISOString(),
  }));
}
