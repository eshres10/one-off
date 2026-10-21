/** survey.offone.com.au (survey.localhost in dev): the maker survey and nothing else. */
export function isSurveyHost(host: string | null | undefined): boolean {
  const h = (host ?? '').toLowerCase().split(':')[0]!;
  return h === 'survey.offone.com.au' || h === 'survey.localhost';
}

export const SURVEY_HOME = 'https://survey.offone.com.au';
