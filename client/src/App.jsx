import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import MainLayout from "./layouts/MainLayout";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/home" element={<MainLayout />} />
            <Route path="/create" element={<MainLayout />} />
            <Route path="/profile" element={<MainLayout />} />
            <Route path="/profile/:userId" element={<MainLayout />} />
            <Route path="/notifications" element={<MainLayout />} />
            <Route path="/search" element={<MainLayout />} />
            <Route path="/settings" element={<MainLayout />} />
          </Route>

          <Route path="*" element={<Navigate to="/signup" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
