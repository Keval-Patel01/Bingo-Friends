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
        status: "LOBBY",
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
    <div className="min-h-screen bg-slate-950 bg-grid-pattern bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-950/40 via-slate-950 to-black text-white flex flex-col items-center justify-center p-4 pt-safe pb-safe relative">
      {/* Decorative High-Tech Neon Glows */}
      <div className="absolute top-1/4 left-1/10 w-96 h-96 bg-purple-600/10 rounded-full filter blur-[150px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/10 w-96 h-96 bg-cyan-600/10 rounded-full filter blur-[150px] pointer-events-none"></div>

      <div className="w-full max-w-md z-10 flex flex-col gap-6">
        
        {/* Futuristic Gaming Header */}
        <div className="text-center mb-2 animate-float">
          <div className="inline-flex items-center justify-center p-3.5 bg-purple-500/10 border border-purple-500/30 rounded-2xl mb-4 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
            {/* SVG Game Controller */}
            <svg className="w-8 h-8 text-purple-400 filter drop-shadow-[0_0_8px_rgba(167,139,250,0.6)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
            </svg>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 font-orbitron tracking-wider filter drop-shadow-[0_2px_15px_rgba(168,85,247,0.3)]">
            NEON BINGO
          </h1>
          <p className="text-cyan-400/80 text-xs font-bold tracking-[0.25em] mt-2 uppercase font-orbitron">
            SHOWDOWN WITH FRIENDS
          </p>
        </div>

        {/* Form Panel Container */}
        <div className="glass-panel-neon p-6 md:p-8 rounded-3xl border border-purple-500/25 relative overflow-hidden">
          
          {/* Top Panel Border Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>

          {/* Player Alias Input Section */}
          <div className="mb-6">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-purple-300 mb-2.5 font-orbitron">
              {/* User SVG */}
              <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              YOUR ALIAS
            </label>
            <div className="relative">
              <input
                type="text"
                className="w-full px-4 py-3.5 pl-11 glass-input rounded-xl text-white placeholder-slate-500 focus:outline-none font-bold text-sm tracking-wide"
                placeholder="Enter gamer alias..."
                maxLength={15}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                @
              </span>
            </div>
          </div>

          <div className="h-[1px] bg-gradient-to-r from-transparent via-purple-500/15 to-transparent my-6"></div>

          {/* Action Sections Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Host Section */}
            <div className="flex flex-col">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-emerald-400 mb-3 font-orbitron">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                HOST MATCH
              </span>
              
              <div className="mb-3.5">
                <label className="block text-[10px] text-slate-400 mb-1.5 font-semibold font-orbitron uppercase tracking-wider">Grid Layout</label>
                <select
                  className="w-full px-3 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500/80 transition-all font-bold cursor-pointer"
                  value={gridSize}
                  onChange={(e) => setGridSize(Number(e.target.value))}
                >
                  {[5, 6, 7].map((n) => (
                    <option key={n} value={n} className="bg-slate-950 text-white font-bold">
                      {n} x {n} Grid
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-5">
                <label className="block text-[10px] text-slate-400 mb-1.5 font-semibold font-orbitron uppercase tracking-wider">Player Limit</label>
                <select
                  className="w-full px-3 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500/80 transition-all font-bold cursor-pointer"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                >
                  {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                    <option key={n} value={n} className="bg-slate-950 text-white font-bold">
                      {n} Players
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={createRoom}
                disabled={loadingCreate}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold py-3 px-4 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.15)] hover:shadow-[0_0_20px_rgba(16,185,129,0.35)] btn-pressable text-xs font-orbitron tracking-widest disabled:opacity-50 mt-auto"
              >
                {loadingCreate ? "INITIALIZING..." : "CREATE ROOM"}
              </button>
            </div>

            {/* Join Section */}
            <div className="flex flex-col md:border-l md:border-slate-800/80 md:pl-6">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-cyan-400 mb-3 font-orbitron">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
                JOIN MATCH
              </span>

              <div className="mb-5 flex-grow flex flex-col justify-start">
                <label className="block text-[10px] text-slate-400 mb-1.5 font-semibold font-orbitron uppercase tracking-wider">Enter Code</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-center uppercase tracking-[0.3em] text-cyan-400 font-extrabold focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 text-lg placeholder-slate-700 h-[42px]"
                  placeholder="CODE"
                  maxLength={4}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                />
              </div>

              <button
                onClick={joinRoom}
                disabled={loadingJoin}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-500 hover:from-cyan-500 hover:to-blue-400 text-white font-bold py-3 px-4 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.15)] hover:shadow-[0_0_20px_rgba(6,182,212,0.35)] btn-pressable text-xs font-orbitron tracking-widest disabled:opacity-50 mt-auto"
              >
                {loadingJoin ? "SEARCHING..." : "JOIN ROOM"}
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Rules / Tips Info Box */}
        <div className="glass-panel p-4 rounded-2xl border border-slate-800 text-center flex items-center justify-center gap-2">
          <span className="text-[10px] text-purple-400 font-bold uppercase font-orbitron tracking-wider">MODE:</span>
          <span className="text-[10px] text-slate-400 font-medium">Shared boards & turn-based strategy showdown</span>
        </div>
      </div>
    </div>
  );
}
