export default function ProfilePostTabs({
  tabs = [],
  activeTab,
  onChange,
  ariaLabel = "Filter profile posts",
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="spotli-profile-tabs">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          aria-pressed={activeTab === tab}
          onClick={() => onChange?.(tab)}
          className={`spotli-profile-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A] focus-visible:ring-offset-2 ${activeTab === tab ? "spotli-profile-tab-active" : ""}`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
