import {
  House,
  Compass,
  PlusSquare,
  Wallet,
  MessageCircle,
  Bookmark,
  UserRound,
  MoreHorizontal,
} from "lucide-react";

const navigation = [
  { label: "Home", icon: House },
  { label: "Explore", icon: Compass },
  { label: "Create", icon: PlusSquare },
  { label: "Wallet", icon: Wallet },
  { label: "Messages", icon: MessageCircle, unread: true },
  { label: "Bookmarks", icon: Bookmark },
  { label: "Profile", icon: UserRound },
];

const creators = [
  {
    name: "Tara James",
    image: "photo-1534528741775-53994a69daeb",
    online: true,
  },
  {
    name: "Kofi Mensah",
    image: "photo-1500648767791-00dcc994a43e",
    online: true,
  },
  {
    name: "Maya Chen",
    image: "photo-1531123897727-8f129e1688ce",
    online: true,
  },
  {
    name: "Noah Carter",
    image: "photo-1506794778202-cad84cf45f1d",
    online: false,
  },
  {
    name: "Lina Moreau",
    image: "photo-1524504388940-b1c1722653e1",
    online: false,
  },
];

function Sidebar({ activePage = "Home", onNavigate = () => {} }) {
  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 w-40 overflow-y-auto border-r border-gray-100 bg-white px-2 py-3 scrollbar-none [&::-webkit-scrollbar]:hidden"
      style={{ msOverflowStyle: "none" }}
    >
      <a
        href="#"
        onClick={(event) => {
          event.preventDefault();
          onNavigate("Home");
        }}
        className="mb-5 block px-2 text-[20px] font-black tracking-tight"
      >
        Spotli<span className="text-red-500">.</span>
      </a>

      <nav className="space-y-1">
        {navigation.map(({ label, icon: Icon, unread }) => (
          <button
            key={label}
            type="button"
            onClick={() => onNavigate(label)}
            className={`relative flex w-full items-center gap-2 rounded-full px-2 py-2.5 text-left text-[13px] font-medium ${
              activePage === label
                ? "bg-black text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Icon size={17} strokeWidth={2} />
            <span>{label}</span>

            {unread && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
            )}
          </button>
        ))}
      </nav>

      <section className="mt-7">
        <h2 className="mb-3 px-2 text-[12px] font-semibold text-gray-500">
          Following
        </h2>

        <div className="space-y-3">
          {creators.map((creator) => (
            <div key={creator.name} className="flex items-center gap-2 px-1">
              <div className="relative shrink-0">
                <img
                  src={`https://images.unsplash.com/${creator.image}?auto=format&fit=crop&w=64&h=64&q=80`}
                  alt={creator.name}
                  className="h-7 w-7 rounded-full object-cover"
                />

                {creator.online && (
                  <span className="absolute -right-0.5 bottom-0 h-1.5 w-1.5 rounded-full border border-white bg-red-500" />
                )}
              </div>

              <span className="truncate text-[11px] text-gray-700">
                {creator.name}
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="mt-4 flex items-center gap-1 px-1 text-[12px] text-gray-500"
        >
          <MoreHorizontal size={15} />
          Show more
        </button>
      </section>
    </aside>
  );
}

export default Sidebar;
