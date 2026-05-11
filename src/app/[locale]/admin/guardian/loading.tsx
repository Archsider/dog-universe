export default function GuardianLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-gray-200 rounded-lg" />
          <div className="h-4 w-64 bg-gray-100 rounded" />
        </div>
        {/* Legend pills */}
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-6 w-20 bg-gray-100 rounded-full" />
          ))}
        </div>
      </div>

      {/* Event list */}
      <div className="space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-200 p-4"
          >
            <div className="flex items-start gap-4">
              {/* Severity dot */}
              <div className="h-3 w-3 mt-1.5 bg-gray-200 rounded-full shrink-0" />

              <div className="flex-1 space-y-2 min-w-0">
                {/* Title + action badge */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <div className="h-5 w-72 bg-gray-200 rounded" />
                    <div className="h-3 w-48 bg-gray-100 rounded" />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <div className="h-5 w-20 bg-gray-100 rounded-full" />
                    <div className="h-5 w-16 bg-gray-200 rounded-full" />
                  </div>
                </div>

                {/* Classification + occurrences */}
                <div className="flex items-center gap-4">
                  <div className="h-5 w-28 bg-gray-100 rounded-full" />
                  <div className="h-3 w-20 bg-gray-100 rounded" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>

                {/* Reason */}
                <div className="h-3 w-4/5 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
