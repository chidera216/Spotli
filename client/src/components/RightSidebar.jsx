import { Flame } from "lucide-react";

const trending = [
  { title: "ESUT", count: "12.3K posts", color: "bg-blue-500" },
  { title: "Study Tips", count: "8.7K posts", color: "bg-sky-500" },
  { title: "Nigerian Food", count: "8.1K posts", color: "bg-emerald-500" },
  { title: "Travel Africa", count: "6.9K posts", color: "bg-purple-500" },
  { title: "Student Life", count: "5.4K posts", color: "bg-orange-500" },
];

const creators = [
  {
    name: "Sophia K.",
    handle: "@sophiak",
    image: "photo-1534528741775-53994a69daeb",
  },
  {
    name: "David Kim",
    handle: "@davidkim",
    image: "photo-1500648767791-00dcc994a43e",
  },
  {
    name: "Chioma Umeh",
    handle: "@chiomaumeh",
    image: "photo-1531123897727-8f129e1688ce",
  },
  {
    name: "Ryan Park",
    handle: "@ryanpark",
    image: "photo-1506794778202-cad84cf45f1d",
  },
  {
    name: "Marcus Lee",
    handle: "@marcuslee",
    image: "photo-1500530855697-b586d89ba3ee",
  },
];

const topics = [
  { name: "Travel", image: "photo-1464822759023-fed622ff2c3b" },
  { name: "Food", image: "photo-1546549032-9571cd6b27df" },
  { name: "Tech", image: "photo-1518770660439-4636190af475" },
  { name: "Study", image: "photo-1434030216411-0b793f4b4173" },
  { name: "Lifestyle", image: "photo-1490730141103-6cac27aaab94" },
  { name: "ESUT", image: "photo-1523050854058-8df90110c9f1" },
];

function RightSidebar() {
  return (
    <aside
      className="fixed inset-y-0 right-0 z-30 hidden w-62.5 overflow-y-auto border-l border-gray-100 bg-white px-3 py-4 scrollbar-none [&::-webkit-scrollbar]:hidden lg:block"
      style={{ msOverflowStyle: "none" }}
    >
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[14px] font-bold">
            <Flame size={16} className="text-red-500" />
            Trending now
          </h2>

          <button type="button" className="text-[11px] text-gray-500">
            See all
          </button>
        </div>

        <div className="space-y-3">
          {trending.map((item, index) => (
            <div key={item.title} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${item.color}`}
              >
                {index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold">
                  {item.title}
                </p>
                <p className="text-[11px] text-gray-500">{item.count}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-bold">Suggested creators</h2>

          <button type="button" className="text-[11px] text-gray-500">
            See all
          </button>
        </div>

        <div className="space-y-3">
          {creators.map((creator) => (
            <div key={creator.name} className="flex items-center gap-2">
              <img
                src={`https://images.unsplash.com/${creator.image}?auto=format&fit=crop&w=64&h=64&q=80`}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold">
                  {creator.name}
                </p>
                <p className="truncate text-[11px] text-gray-500">
                  {creator.handle}
                </p>
              </div>

              <button
                type="button"
                aria-label={`Follow ${creator.name}`}
                className="rounded-full border border-gray-200 px-2 py-1 text-[11px] font-semibold hover:bg-gray-50"
              >
                Follow
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-bold">Popular topics</h2>

          <button type="button" className="text-[11px] text-gray-500">
            See all
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {topics.map((topic) => (
            <button
              key={topic.name}
              type="button"
              className="relative aspect-square overflow-hidden rounded-md"
            >
              <img
                src={`https://images.unsplash.com/${topic.image}?auto=format&fit=crop&w=160&h=160&q=80`}
                alt=""
                className="h-full w-full object-cover"
              />

              <span className="absolute inset-0 bg-black/30" />

              <span className="absolute inset-x-0 bottom-1 text-center text-[10px] font-semibold text-white">
                {topic.name}
              </span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

export default RightSidebar;
