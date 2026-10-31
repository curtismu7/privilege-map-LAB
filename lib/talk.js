// Talk track (rule 3): docs/talk-track.md split into presenter steps at each "## " heading.
export function parseTalkTrack(markdown) {
  const steps = [];
  let current = null;
  for (const line of String(markdown).split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = { title: heading[1], body: [] };
      steps.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return steps.map((s) => ({ title: s.title, body: s.body.join('\n').trim() }));
}
