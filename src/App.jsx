// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Lobby from "./componenets/Lobby";
import GameRoom from "./componenets/gameRooms";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Lobby />} />
        {/* The :roomId is a dynamic parameter */}
        <Route path="/game/:roomId" element={<GameRoom />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
