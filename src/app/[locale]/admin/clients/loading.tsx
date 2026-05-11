export default function ClientsLoading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="space-y-2">
          <div className="h-8 w-28 bg-gray-200 rounded-lg" />
          <div className="h-4 w-64 bg-gray-100 rounded" />
        </div>
        <div className="h-9 w-40 bg-gray-200 rounded-lg" />
      </div>

      {/* Search + grade filter pills */}
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <div className="flex-1 min-w-[240px] h-11 bg-gray-100 rounded-lg" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-20 bg-gray-100 rounded-lg" />
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-6 gap-4 px-6 py-3 border-b border-gray-100 bg-gray-50/50">
          {['w-32', 'w-40', 'w-12', 'w-16', 'w-20', 'w-16'].map((w, i) => (
            <div key={i} className={`h-3 ${w} bg-gray-200 rounded`} />
          ))}
        </div>

        {/* Data rows */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-6 gap-4 px-6 py-4 border-b border-gray-50 items-center"
          >
            {/* Name + initials avatar */}
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 bg-gray-200 rounded-full shrink-0" />
              <div className="space-y-1">
                <div className="h-4 w-24 bg-gray-200 rounded" />
                <div className="h-3 w-16 bg-gray-100 rounded" />
              </div>
            </div>
            <div className="h-3 w-36 bg-gray-100 rounded" />
            <div className="h-4 w-6 bg-gray-100 rounded" />
            <div className="h-4 w-6 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
            {/* Grade badge */}
            <div className="h-6 w-16 bg-gray-200 rounded-full" />
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4">
        <div className="h-4 w-32 bg-gray-100 rounded" />
        <div className="flex gap-2">
          <div className="h-8 w-20 bg-gray-200 rounded-lg" />
          <div className="h-8 w-20 bg-gray-200 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
