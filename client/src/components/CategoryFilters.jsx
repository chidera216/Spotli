import { useState } from "react";

const categories = [
  "For You",
  "Following",
  "ESUT",
  "Tech",
  "Travel",
  "Food",
  "Lifestyle",
  "Study",
  "Fitness",
  "Music",
];

function CategoryFilters() {
  const [activeCategory, setActiveCategory] = useState("For You");

  return (
    <nav
      aria-label="Content categories"
      className="mt-4 flex gap-2 overflow-x-auto pb-2"
    >
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => setActiveCategory(category)}
          className={`shrink-0 rounded-full px-3.5 py-2 text-[12px] font-medium transition ${
            activeCategory === category
              ? "bg-black text-white"
              : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {category}
        </button>
      ))}
    </nav>
  );
}

export default CategoryFilters;
