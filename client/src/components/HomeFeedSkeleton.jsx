const skeletonCards = [
  { id: "card-1" },
  { id: "card-2" },
  { id: "card-3", wide: true },
  { id: "card-4" },
  { id: "card-5" },
  { id: "card-6" },
];

function SkeletonBlock({ className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-gray-200 motion-reduce:animate-none dark:bg-gray-800 ${className}`}
    />
  );
}

/**
 * Mirrors Spotli's responsive post grid while feed data is loading.
 * It renders no images or video players, so it doesn't compete with media
 * requests during startup.
 */
function HomeFeedSkeleton({ label = "Loading posts" }) {
  return (
    <section
      aria-label={label}
      aria-busy="true"
      role="status"
      className="mt-4 grid grid-flow-dense grid-cols-2 items-start gap-x-3 gap-y-5 pb-6 sm:gap-x-4 lg:grid-cols-3 lg:gap-x-3 lg:gap-y-4"
    >
      <span className="sr-only">{label}</span>
      {skeletonCards.map((card) => (
        <article
          key={card.id}
          aria-hidden="true"
          className={`min-w-0 ${card.wide ? "col-span-full" : ""}`}
        >
          <SkeletonBlock
            className={`aspect-video w-full ${card.wide ? "rounded-xl" : "rounded-lg"}`}
          />

          <div className="mt-2 flex min-w-0 items-start gap-2">
            <SkeletonBlock className="h-7 w-7 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2 pt-0.5">
              <SkeletonBlock className="h-3.5 w-11/12" />
              <SkeletonBlock className="h-3 w-3/5" />
              <div className="flex items-center gap-2 pt-0.5">
                <SkeletonBlock className="h-2.5 w-10" />
                <SkeletonBlock className="h-2.5 w-8" />
              </div>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

export default HomeFeedSkeleton;
