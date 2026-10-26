/** Short yes/send replies while a send_* pending action is waiting. */
export function isPendingSendAffirmation(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[!?.]+$/g, "")
    .replace(/\s+/g, " ");
  if (!normalized || normalized.length > 48) return false;
  return /^(yes|yep|yeah|yup|ok|okay|sure|send|send it|send now|go ahead|do it|please send|yes send( it)?( now)?|ja|japp|absolut|skicka|skicka den)$/i.test(
    normalized
  );
}

export function isPendingSendDecline(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[!?.]+$/g, "")
    .replace(/\s+/g, " ");
  if (!normalized || normalized.length > 48) return false;
  return /^(no|nope|nah|cancel|don't|dont|do not|not now|stop|nej|avbryt)$/i.test(
    normalized
  );
}
