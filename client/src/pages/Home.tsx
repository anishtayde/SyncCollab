import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, clearToken } from "../api";

interface RoomItem {
  id: string;
  name: string;
}

export default function Home() {
  const [email, setEmail] = useState("");
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api("/auth/me")
      .then((data) => setEmail(data.user.email))
      .catch(() => {
        clearToken();
        navigate("/login");
      });
    api("/rooms")
      .then((data) => setRooms(data.rooms))
      .catch(() => {});
  }, [navigate]);

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data = await api("/rooms", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setRooms([data.room, ...rooms]);
      setName("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="container">
      <h1 className="page-title">Welcome{email ? `, ${email.split("@")[0]}` : ""}</h1>
      <p className="muted">Create a room and share it to code together live.</p>

      <form onSubmit={createRoom} className="create-form">
        <input
          placeholder="New room name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="primary" disabled={!name.trim()}>
          Create room
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}

      <h3 className="section-title">Your rooms</h3>
      {rooms.length === 0 ? (
        <div className="empty">No rooms yet. Create your first one above.</div>
      ) : (
        <div className="rooms-grid">
          {rooms.map((r) => (
            <Link key={r.id} to={`/room/${r.id}`} className="room-card">
              <strong>{r.name}</strong>
              <span className="muted">Open room →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}