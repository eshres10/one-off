/** survey.offone.world (survey.localhost in dev): the maker survey and nothing else. */
const SURVEY_HOSTS = ['survey.offone.world', 'survey.offone.com.au', 'survey.localhost'];

export function isSurveyHost(host: string | null | undefined): boolean {
  const h = (host ?? '').toLowerCase().split(':')[0]!;
  return SURVEY_HOSTS.includes(h);
}

export const SURVEY_HOME = 'https://survey.offone.world';
