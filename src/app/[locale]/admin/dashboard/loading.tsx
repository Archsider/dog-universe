export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 h-28">
            <div className="h-3 w-20 bg-gray-100 rounded mb-3" />
            <div className="h-7 w-16 bg-gray-200 rounded mb-2" />
            <div className="h-2 w-24 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
      {/* Chart placeholder */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 h-64">
        <div className="h-4 w-32 bg-gray-100 rounded mb-4" />
        <div className="h-48 bg-gray-50 rounded" />
      </div>
      {/* Recent bookings */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5">
        <div className="h-4 w-40 bg-gray-100 rounded mb-4" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
            <div className="h-8 w-8 rounded-full bg-gray-100" />
            <div className="flex-1">
              <div className="h-3 w-32 bg-gray-100 rounded mb-2" />
              <div className="h-2 w-20 bg-gray-50 rounded" />
            </div>
            <div className="h-5 w-16 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
