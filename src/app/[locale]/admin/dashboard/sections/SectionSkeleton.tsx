// Skeleton fallback rendered during Suspense streaming.
export function SectionSkeleton({ height = 'h-64' }: { height?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card animate-pulse ${height}`}>
      <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-5/6" />
        <div className="h-3 bg-gray-100 rounded w-4/6" />
      </div>
    </div>
  );
}
