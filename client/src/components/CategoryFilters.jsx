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

function CategoryFilters({ activeCategory = "For You", onChange = () => {} }) {
  return (
    <nav
      aria-label="Content categories"
      className="mt-4 flex gap-2 overflow-x-auto pb-2"
    >
      {categories.map((category) => {
        const selected = activeCategory === category;

        return (
          <button
            key={category}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(category)}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#07090D] ${
              selected
                ? "border-black bg-black text-white dark:border-[#F3F5F8] dark:bg-[#F3F5F8] dark:text-[#07090D]"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            {category}
          </button>
        );
      })}
    </nav>
  );
}

export default CategoryFilters;
