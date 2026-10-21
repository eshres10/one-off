import { Survey } from '@/components/survey/Survey';
import { TAG_RE } from '@/lib/survey/questions';

export const dynamic = 'force-dynamic';

/** The maker survey. `?src=` and `?ref=` say which invite or post the maker came from. */
export default function SurveyPage({
  searchParams,
}: {
  searchParams: { src?: string | string[]; ref?: string | string[] };
}) {
  const tag = (v: string | string[] | undefined) => {
    const s = Array.isArray(v) ? v[0] : v;
    return s && TAG_RE.test(s) ? s : null;
  };
  return <Survey src={tag(searchParams.src)} refTag={tag(searchParams.ref)} />;
}
