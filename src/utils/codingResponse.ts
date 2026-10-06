/** Recover only independently complete, validated actions before a cutoff.
 * Never close a truncated string/object or infer missing source characters.
 */
export function completeActionPrefix(text: string, validate: (text: string) => void): string {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '');
  const start = /^\{\s*"actions"\s*:\s*\[/.exec(clean);
  if (!start) return '';
  const actions: unknown[] = [];
  let offset = start[0].length;
  while (actions.length < 8) {
    while (/\s/.test(clean[offset] ?? '') && offset < clean.length) offset++;
    if (clean[offset] !== '{') break;
    const beginning = offset;
    let depth = 0; let quoted = false; let escaped = false; let complete = false;
    for (; offset < clean.length; offset++) {
      const char = clean[offset];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{' || char === '[') depth++;
      else if (char === '}' || char === ']') {
        if (--depth === 0) { offset++; complete = true; break; }
      }
    }
    if (!complete) break;
    try {
      const action = JSON.parse(clean.slice(beginning, offset));
      // A cutoff cannot confirm the model completed its implementation/review.
      if (action?.tool === 'finish') break;
      const candidate = JSON.stringify({ actions: [...actions, action] });
      validate(candidate);
      actions.push(action);
    } catch { break; }
    while (/\s/.test(clean[offset] ?? '') && offset < clean.length) offset++;
    if (clean[offset] !== ',') break;
    offset++;
  }
  return actions.length ? JSON.stringify({ actions }) : '';
}
