export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-gray-200 rounded-lg" />
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="h-3 w-20 bg-gray-100 rounded" />
            <div className="h-7 w-28 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      {/* Second KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="h-3 w-20 bg-gray-100 rounded" />
            <div className="h-7 w-28 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      {/* Check-ins/outs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 h-40" />
        <div className="bg-white rounded-xl border border-gray-200 p-5 h-40" />
      </div>
      {/* Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 h-72" />
    </div>
  );
}
