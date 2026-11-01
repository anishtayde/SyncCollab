import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearToken, getToken } from "./api";

export default function TopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // hidden on the login page and when logged out
  if (pathname === "/login" || !getToken()) return null;

  function logout() {
    clearToken();
    navigate("/login");
  }

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <span className="brand-mark">SC</span>
        SyncCollab
      </Link>
      <button onClick={logout}>Log out</button>
    </header>
  );
}