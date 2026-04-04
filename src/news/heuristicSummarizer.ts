import type { SituationCluster, SituationClusterDraft, Summarizer } from '../types.js';
import { formatShortTimestamp } from '../utils/time.js';
import { stripHeadlineBoilerplate, toSentenceList, truncate } from '../utils/text.js';

export class HeuristicSummarizer implements Summarizer {
  summarize(_topic: string, draft: SituationClusterDraft): SituationCluster {
    const representative = draft.articles[0];
    const title = truncate(stripHeadlineBoilerplate(representative?.title || 'Emerging coverage'), 96);
    const sourceCount = new Set(draft.articles.map((article) => article.domain)).size;
    const recurring = draft.namedEntities.length > 0 ? draft.namedEntities : draft.keywords.slice(0, 3);
    const recurringLine =
      recurring.length > 0 ? ` Repeated threads include ${toSentenceList(recurring.slice(0, 3))}.` : '';

    const summary = `${draft.articleCount} related article${
      draft.articleCount === 1 ? '' : 's'
    } center on ${title}.${recurringLine} Seen across ${sourceCount} outlet${
      sourceCount === 1 ? '' : 's'
    } between ${formatShortTimestamp(draft.firstSeen)} and ${formatShortTimestamp(draft.lastSeen)}.`;

    return {
      ...draft,
      title,
      summary
    };
  }
}

