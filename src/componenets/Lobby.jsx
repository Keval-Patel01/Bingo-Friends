import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ref, set, get } from "firebase/database";
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
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [joinCode, setJoinCode] = useState("");
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingJoin, setLoadingJoin] = useState(false);

  useEffect(() => {
    localStorage.setItem("bingoPlayerName", playerName);
  }, [playerName]);

  const createRoom = async () => {
    if (!playerName.trim()) return alert("Please enter your name first!");
    
    setLoadingCreate(true);
    const roomId = generateRoomId();

    try {
      await set(ref(db, `rooms/${roomId}`), {
        gridSize,
        maxPlayers,
        status: "LOBBY", // Starts in LOBBY state
        selectedNumbers: [],
        currentTurn: 0,
        turnOrder: [playerName],
        winners: [],
        players: {
          [playerName]: {
            card: generateBingoCard(gridSize),
            joinedAt: Date.now(),
          },
        },
      });

      setLoadingCreate(false);
      navigate(`/game/${roomId}`);
    } catch (err) {
      console.error("Error creating room:", err);
      alert("Failed to create room. Please try again.");
      setLoadingCreate(false);
    }
  };

  const joinRoom = async () => {
    if (!playerName.trim()) return alert("Please enter your name first!");
    if (!joinCode.trim()) return alert("Please enter a room code!");

    setLoadingJoin(true);
    const code = joinCode.toUpperCase();
    const roomRef = ref(db, `rooms/${code}`);

    try {
      const snapshot = await get(roomRef);
      if (!snapshot.exists()) {
        alert(`Room "${code}" does not exist.`);
        setLoadingJoin(false);
        return;
      }

      const roomData = snapshot.val();

      if (roomData.status !== "LOBBY") {
        if (roomData.status === "PLAYING") {
          alert("This game has already started! Cannot join mid-game.");
        } else if (roomData.status === "FINISHED") {
          alert("This game is already over.");
        } else {
          alert("This room is no longer accessible.");
        }
        setLoadingJoin(false);
        return;
      }

      const activePlayers = Object.keys(roomData.players || {});
      if (activePlayers.length >= roomData.maxPlayers) {
        alert("This room is already full!");
        setLoadingJoin(false);
        return;
      }

      setLoadingJoin(false);
      navigate(`/game/${code}`);
    } catch (err) {
      console.error("Error joining room:", err);
      alert("Failed to join room. Please check your internet connection.");
      setLoadingJoin(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-slate-950 to-black text-white flex flex-col items-center justify-center p-4">
      {/* Decorative Neon Elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-purple-600 rounded-full filter blur-[128px] opacity-20 pointer-events-none"></div>
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-cyan-600 rounded-full filter blur-[128px] opacity-15 pointer-events-none"></div>

      <div className="w-full max-w-md z-10">
        {/* Logo / Header */}
        <div className="text-center mb-8 animate-float">
          <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-yellow-400 font-orbitron tracking-wider filter drop-shadow-[0_2px_10px_rgba(236,72,153,0.3)]">
            NEON BINGO
          </h1>
          <p className="text-cyan-400 text-sm font-semibold tracking-widest mt-2 uppercase font-orbitron">
            Showdown with Friends
          </p>
        </div>

        {/* Form Container */}
        <div className="glass-panel-neon p-8 rounded-2xl border border-purple-500/20 backdrop-blur-md">
          {/* Player Name Input */}
          <div className="mb-6">
            <label className="block text-xs font-semibold uppercase tracking-wider text-purple-300 mb-2 font-orbitron">
              Enter Your Alias
            </label>
            <input
              type="text"
              className="w-full px-4 py-3 bg-slate-900/80 border border-purple-500/30 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 transition-all font-medium font-inter"
              placeholder="e.g., CyberPlayer"
              maxLength={15}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
            />
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-purple-500/20 to-transparent my-6"></div>

          {/* Tab Selection */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Create Section */}
            <div className="flex flex-col">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2 font-orbitron">
                Host a Game
              </span>
              
              <div className="mb-3">
                <label className="block text-[10px] text-slate-400 mb-1">Grid Size</label>
                <select
                  className="w-full p-2 py-2.5 bg-slate-900/60 border border-slate-700/60 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-all"
                  value={gridSize}
                  onChange={(e) => setGridSize(Number(e.target.value))}
                >
                  {[5, 6, 7].map((n) => (
                    <option key={n} value={n} className="bg-slate-950 text-white">
                      {n} x {n} Grid
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-[10px] text-slate-400 mb-1">Max Players</label>
                <select
                  className="w-full p-2 py-2.5 bg-slate-900/60 border border-slate-700/60 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-all"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                >
                  {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                    <option key={n} value={n} className="bg-slate-950 text-white">
                      {n} Players
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={createRoom}
                disabled={loadingCreate}
                className="w-full bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-bold py-3 px-4 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all duration-300 transform active:scale-95 text-xs font-orbitron disabled:opacity-50"
              >
                {loadingCreate ? "CONFIGURING..." : "CREATE ROOM"}
              </button>
            </div>

            {/* Join Section */}
            <div className="flex flex-col border-l border-slate-800 pl-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-2 font-orbitron">
                Join a Game
              </span>

              <div className="mb-4 flex-grow flex flex-col justify-start">
                <label className="block text-[10px] text-slate-400 mb-1">Room Code</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/60 rounded-lg text-center uppercase tracking-widest text-slate-200 font-bold focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/20 text-base"
                  placeholder="CODE"
                  maxLength={4}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                />
              </div>

              <button
                onClick={joinRoom}
                disabled={loadingJoin}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-500 hover:from-cyan-500 hover:to-blue-400 text-white font-bold py-3 px-4 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.2)] hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all duration-300 transform active:scale-95 text-xs font-orbitron disabled:opacity-50 mt-auto"
              >
                {loadingJoin ? "SEARCHING..." : "JOIN ROOM"}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-8 font-inter">
          Turn-based strategy meets luck. Select a number to check it off for everyone!
        </p>
      </div>
    </div>
  );
}
