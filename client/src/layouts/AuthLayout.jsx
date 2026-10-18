import { Outlet } from "react-router-dom";

function AutoLayout() {
  return (
    <div className="min-h-screen w-full bg-white">
      <Outlet />
    </div>
  );
}

export default AutoLayout;
