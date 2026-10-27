/** Short yes/send replies while a send_* pending action is waiting. */
export function isPendingSendAffirmation(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[!?.]+$/g, "")
    .replace(/\s+/g, " ");
  if (!normalized || normalized.length > 64) return false;
  return /^(yes|yep|yeah|yup|ok|okay|sure|send|send it|send now|send them|send them all|go ahead|go for it|do it|do that|please send|please do|sounds good|sounds great|yes please|yes send( it| them)?( now| all)?|invoice them|invoice them all|create them|create them all|yes and draft( the)?( deposit| invoice| retainer)?|yes draft( the)?( deposit| invoice| retainer)?|ja|japp|absolut|kör|skicka|skicka den|skicka dem)$/i.test(
    normalized
  );
}

/** True when confirming convert + also drafting an invoice/deposit. */
export function wantsInvoiceWithConvert(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /\b(draft|invoice|deposit|retainer|upfront)\b/i.test(normalized);
}

export function isPendingSendDecline(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[!?.]+$/g, "")
    .replace(/\s+/g, " ");
  if (!normalized || normalized.length > 64) return false;
  return /^(no|nope|nah|cancel|don't|dont|do not|not now|not yet|stop|wait|wait a (sec|second|bit|minute)|hold on|later|maybe later|skip|nej|avbryt|vänta)$/i.test(
    normalized
  );
}
