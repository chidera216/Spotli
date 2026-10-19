import { Plus } from "lucide-react";

const stories = [
  { name: "Tara James", image: "photo-1534528741775-53994a69daeb" },
  { name: "Kofi Mensah", image: "photo-1500648767791-00dcc994a43e" },
  { name: "Maya Chen", image: "photo-1531123897727-8f129e1688ce" },
  { name: "Noah Carter", image: "photo-1506794778202-cad84cf45f1d" },
  { name: "Lina Moreau", image: "photo-1524504388940-b1c1722653e1" },
  { name: "Amara Okeke", image: "photo-1534751516642-a1af1ef26a56" },
  { name: "David Kim", image: "photo-1506794778202-cad84cf45f1d" },
  { name: "Chioma Umeh", image: "photo-1534528741775-53994a69daeb" },
  { name: "Ryan Park", image: "photo-1500648767791-00dcc994a43e" },
];

function Stories() {
  return (
    <section className="mt-3">
      <h2 className="mb-2 text-[13px] font-semibold text-gray-900">Stories</h2>

      <div className="flex gap-3 overflow-x-auto pb-1">
        <button
          type="button"
          className="flex w-12 shrink-0 flex-col items-center gap-1"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-gray-400">
            <Plus size={18} />
          </span>
          <span className="text-[11px] text-gray-600">Your story</span>
        </button>

        {stories.map((story) => (
          <button
            type="button"
            key={story.name}
            className="flex w-12 shrink-0 flex-col items-center gap-1"
          >
            <span className="rounded-full bg-linear-to-tr from-orange-400 via-red-500 to-purple-500 p-[2px]">
              <img
                src={`https://images.unsplash.com/${story.image}?auto=format&fit=crop&w=80&h=80&q=80`}
                alt={story.name}
                className="h-8 w-8 rounded-full border border-white object-cover"
              />
            </span>
            <span className="w-full truncate text-center text-[10px] text-gray-700">
              {story.name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default Stories;
