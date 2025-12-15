import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ref, set } from "firebase/database";
import { db } from "../firebase";
import { generateBingoCard } from "../utils/bingoUtils";

const generateRoomId = () =>
  Math.random().toString(36).substring(2, 6).toUpperCase();

export default function Lobby() {
  const navigate = useNavigate();

  const [playerName, setPlayerName] = useState(
    localStorage.getItem("bingoPlayerName") || ""
  );
  const [gridSize, setGridSize] = useState(5);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    localStorage.setItem("bingoPlayerName", playerName);
  }, [playerName]);

  const createRoom = async () => {
    if (!playerName.trim()) return alert("Enter name");

    const roomId = generateRoomId();

    await set(ref(db, `rooms/${roomId}`), {
      gridSize,
      maxPlayers,
      status: "PLAYING",
      currentTurn: 0,
      turnOrder: [playerName],
      winners: [],
      players: {
        [playerName]: {
          card: generateBingoCard(gridSize),
          joinedAt: Date.now(),
          lines: 0,
        },
      },
    });

    navigate(`/game/${roomId}`);
  };

  const joinRoom = () => {
    if (!playerName || !joinCode) return alert("Missing info");
    navigate(`/game/${joinCode.toUpperCase()}`);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-xl w-full max-w-md">
        <h1 className="text-3xl font-bold text-yellow-400 mb-6">Bingo Lobby</h1>

        <input
          className="w-full p-3 mb-4 bg-gray-700 rounded"
          placeholder="Player Name"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
        />

        <label>Grid Size</label>
        <select
          className="w-full p-3 mb-4 bg-gray-700 rounded"
          value={gridSize}
          onChange={(e) => setGridSize(Number(e.target.value))}>
          {[5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>

        <label>Max Players</label>
        <select
          className="w-full p-3 mb-6 bg-gray-700 rounded"
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}>
          {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>

        <button
          onClick={createRoom}
          className="w-full bg-green-500 p-3 rounded mb-4 font-bold">
          Create Room
        </button>

        <input
          className="w-full p-3 mb-2 bg-gray-700 rounded"
          placeholder="Room Code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
        />

        <button
          onClick={joinRoom}
          className="w-full bg-blue-500 p-3 rounded font-bold">
          Join Room
        </button>
      </div>
    </div>
  );
}
