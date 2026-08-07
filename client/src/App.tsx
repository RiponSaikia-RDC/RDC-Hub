import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Activate } from "./pages/Activate";
import { NewRequest } from "./pages/NewRequest";
import { MyRequests } from "./pages/MyRequests";
import { Queue } from "./pages/Queue";
import { RequestDetail } from "./pages/RequestDetail";
import { Faq } from "./pages/Faq";
import { AdminOverview } from "./pages/admin/AdminOverview";
import { AdminRequests } from "./pages/admin/AdminRequests";
import { Users } from "./pages/admin/Users";
import { QueryTypes } from "./pages/admin/QueryTypes";
import { Assignments } from "./pages/admin/Assignments";
import { Plants } from "./pages/admin/Plants";

function Home() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "PLANT_STAFF") return <Navigate to="/new-request" replace />;
  if (user.role === "MEMBER") return <Navigate to="/queue" replace />;
  return <Navigate to="/admin" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/activate" element={<Activate />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/requests/:id" element={<RequestDetail />} />
          <Route path="/faq" element={<Faq />} />

          <Route element={<ProtectedRoute roles={["PLANT_STAFF"]} />}>
            <Route path="/new-request" element={<NewRequest />} />
            <Route path="/my-requests" element={<MyRequests />} />
          </Route>

          <Route element={<ProtectedRoute roles={["MEMBER"]} />}>
            <Route path="/queue" element={<Queue />} />
          </Route>

          <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
            <Route path="/admin" element={<AdminOverview />} />
            <Route path="/admin/requests" element={<AdminRequests />} />
            <Route path="/admin/users" element={<Users />} />
            <Route path="/admin/query-types" element={<QueryTypes />} />
            <Route path="/admin/assignments" element={<Assignments />} />
            <Route path="/admin/plants" element={<Plants />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
