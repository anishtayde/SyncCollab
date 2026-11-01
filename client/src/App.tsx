import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Room from "./pages/Room";
import TopBar from "./TopBar";

export default function App() {
  return (
    <>
      <TopBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/room/:id" element={<Room />} />
      </Routes>
    </>
  );
}