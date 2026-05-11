export default function ReviewsLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="h-8 w-32 bg-gray-200 rounded-lg" />
        <div className="h-9 w-24 bg-gray-100 rounded-lg" />
      </div>

      {/* Stats bar: avg rating + total */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="space-y-2">
            <div className="h-3 w-20 bg-gray-100 rounded" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-12 bg-gray-200 rounded" />
              {/* Star row */}
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-5 w-5 bg-gray-200 rounded" />
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3 w-24 bg-gray-100 rounded" />
            <div className="h-7 w-10 bg-gray-200 rounded" />
          </div>
        </div>
      </div>

      {/* Filter pills: rating 1-5 + sort */}
      <div className="flex gap-2 flex-wrap items-center">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-gray-100 rounded-full" />
        ))}
      </div>

      {/* Review cards */}
      <div className="space-y-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-200 p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="h-5 w-32 bg-gray-200 rounded" />
                <div className="h-3 w-24 bg-gray-100 rounded" />
              </div>
              {/* Stars */}
              <div className="flex gap-1 shrink-0">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="h-4 w-4 bg-gray-200 rounded" />
                ))}
              </div>
            </div>
            {/* Comment */}
            <div className="space-y-1.5">
              <div className="h-4 w-full bg-gray-100 rounded" />
              <div className="h-4 w-4/5 bg-gray-100 rounded" />
            </div>
            {/* Meta: service + date */}
            <div className="flex gap-4">
              <div className="h-5 w-20 bg-gray-100 rounded-full" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center">
        <div className="h-4 w-32 bg-gray-100 rounded" />
        <div className="flex gap-2">
          <div className="h-8 w-20 bg-gray-200 rounded-lg" />
          <div className="h-8 w-20 bg-gray-200 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
