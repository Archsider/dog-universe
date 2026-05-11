export default function AnalyticsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="h-8 w-36 bg-gray-200 rounded-lg" />

      {/* Top KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="h-3 w-24 bg-gray-100 rounded" />
            <div className="h-7 w-28 bg-gray-200 rounded" />
            <div className="h-3 w-16 bg-gray-100 rounded" />
          </div>
        ))}
      </div>

      {/* Revenue chart — large rectangle */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="h-4 w-40 bg-gray-200 rounded" />
        {/* Chart area */}
        <div className="h-56 w-full bg-gray-100 rounded-lg" />
        {/* X-axis labels */}
        <div className="flex justify-between px-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-3 w-6 bg-gray-100 rounded" />
          ))}
        </div>
      </div>

      {/* Two-column: category breakdown + new clients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="h-4 w-36 bg-gray-200 rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-3 bg-gray-200 rounded-sm shrink-0" />
              <div className="h-3 flex-1 bg-gray-100 rounded" />
              <div className="h-4 w-20 bg-gray-200 rounded" />
            </div>
          ))}
        </div>

        {/* Bar chart for avg basket / nights */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-40 w-full bg-gray-100 rounded-lg" />
        </div>
      </div>

      {/* Year-over-year comparison chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="h-4 w-48 bg-gray-200 rounded" />
        <div className="h-48 w-full bg-gray-100 rounded-lg" />
      </div>
    </div>
  );
}
