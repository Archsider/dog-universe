export default function AnalyticsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-40 bg-gray-200 rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 h-24">
            <div className="h-3 w-20 bg-gray-100 rounded mb-3" />
            <div className="h-7 w-24 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 h-72">
          <div className="h-4 w-36 bg-gray-100 rounded mb-4" />
          <div className="h-56 bg-gray-50 rounded" />
        </div>
      ))}
    </div>
  );
}
