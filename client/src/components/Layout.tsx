import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // The truck graphic isn't bundled — see client/public/rdc-truck.png — so
  // this hides itself cleanly instead of showing a broken-image icon until
  // that file is dropped in.
  const [logoOk, setLogoOk] = useState(true);

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            {logoOk && (
              <img
                src="/rdc-truck.png"
                alt=""
                className="h-10 w-auto shrink-0"
                onError={() => setLogoOk(false)}
              />
            )}
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight text-slate-800">RDC Concrete India Ltd.</div>
              <div className="text-[11px] text-slate-400">We Promise We Deliver</div>
            </div>
          </div>

          <div className="justify-self-center text-xl font-bold tracking-tight text-brand-700">RDC Hub</div>

          <div className="flex items-center justify-end gap-3">
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
        <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 pb-2">
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
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
