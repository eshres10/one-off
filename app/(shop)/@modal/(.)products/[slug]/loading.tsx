export default function QuickViewLoading() {
  return (
    <div className="flex h-full" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-full w-[55%]" />
      <div className="flex-1 space-y-4 px-7 pt-6">
        <div className="skeleton h-10 w-2/3" />
        <div className="skeleton h-9 w-4/5" />
        <div className="skeleton h-5 w-1/4" />
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-12 w-full" />
      </div>
    </div>
  );
}
