const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'says',
  'that',
  'the',
  'their',
  'to',
  'up',
  'with'
]);

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

export function normalizeTopic(topic: string): string {
  return normalizeWhitespace(topic).toLowerCase();
}

export function stripHeadlineBoilerplate(title: string): string {
  return normalizeWhitespace(
    title
      .replace(/\s+\|\s+.+$/u, '')
      .replace(/\s+-\s+[^-]+$/u, '')
      .replace(/\s+–\s+[^–]+$/u, '')
  );
}

export function tokenize(value: string): string[] {
  return normalizeWhitespace(
    value
      .toLowerCase()
      .replace(/https?:\/\/\S+/gu, ' ')
      .replace(/[^a-z0-9\s-]/gu, ' ')
      .replace(/-/gu, ' ')
  )
    .split(' ')
    .map(stemToken)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

export function titleTokenSet(title: string): Set<string> {
  return new Set(tokenize(stripHeadlineBoilerplate(title)));
}

export function jaccardScore(left: Iterable<string>, right: Iterable<string>): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set<string>([...leftSet, ...rightSet]);
  if (union.size === 0) {
    return 0;
  }

  let intersectionSize = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) {
      intersectionSize += 1;
    }
  }

  return intersectionSize / union.size;
}

export function takeTopTerms(counts: Map<string, number>, limit: number): string[] {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([term]) => term);
}

export function extractNamedEntities(value: string): string[] {
  const matches = value.match(/\b(?:[A-Z]{2,}|[A-Z][a-z]+)(?:\s+(?:[A-Z]{2,}|[A-Z][a-z]+)){0,3}\b/gu);
  if (!matches) {
    return [];
  }

  return [...new Set(matches.map((match) => normalizeWhitespace(match)).filter((match) => match.length > 2))];
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function toSentenceList(values: string[]): string {
  if (values.length === 0) {
    return '';
  }
  if (values.length === 1) {
    return values[0]!;
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function stemToken(token: string): string {
  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 4) {
    return token.slice(0, -1);
  }

  return token;
}
