import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold text-brand-700">RDC Hub</span>
            <nav className="flex items-center gap-1">
              {user.role === "PLANT_STAFF" && (
                <>
                  <NavLink to="/new-request" className={linkClass}>New Request</NavLink>
                  <NavLink to="/my-requests" className={linkClass}>My Requests</NavLink>
                  <NavLink to="/faq" className={linkClass}>Common Questions</NavLink>
                </>
              )}
              {user.role === "MEMBER" && (
                <>
                  <NavLink to="/queue" className={linkClass}>My Queue</NavLink>
                  <NavLink to="/faq" className={linkClass}>Common Questions</NavLink>
                </>
              )}
              {user.role === "ADMIN" && (
                <>
                  <NavLink to="/admin" className={linkClass} end>Overview</NavLink>
                  <NavLink to="/admin/requests" className={linkClass}>All Requests</NavLink>
                  <NavLink to="/admin/users" className={linkClass}>Users</NavLink>
                  <NavLink to="/admin/query-types" className={linkClass}>Query Types</NavLink>
                  <NavLink to="/admin/assignments" className={linkClass}>Assignments</NavLink>
                  <NavLink to="/admin/plants" className={linkClass}>Plants</NavLink>
                  <NavLink to="/faq" className={linkClass}>Common Questions</NavLink>
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium text-slate-800">{user.name}</div>
              <div className="text-xs text-slate-500">{user.role.replace("_", " ")}</div>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
