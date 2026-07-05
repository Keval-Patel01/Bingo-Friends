import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ref, onValue, runTransaction } from "firebase/database";
import { db } from "../firebase";
import {
  generateBingoCard,
  checkForWin,
  countCompletedLines,
} from "../utils/bingoUtils";

export default function GameRoom() {
  const { roomId } = useParams();
  const cleanRoomId = roomId?.toUpperCase() || "";
  const navigate = useNavigate();
  const playerName = localStorage.getItem("bingoPlayerName") || "Guest";

  const [roomData, setRoomData] = useState(null);
  const [myLines, setMyLines] = useState(0);
  const [card, setCard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const joinedRef = useRef(false);

  // Derived states
  const selectedNumbers = roomData?.selectedNumbers || [];
  const turnOrder = roomData?.turnOrder || [];
  const currentTurn = roomData?.currentTurn ?? 0;
  const winners = roomData?.winners || [];
  const status = roomData?.status || "LOBBY";
  const gridSize = roomData?.gridSize || 5;
  const maxPlayers = roomData?.maxPlayers || 4;

  const currentPlayerName = turnOrder[currentTurn] || "Waiting...";
  const isMyTurn = turnOrder[currentTurn] === playerName;
  const isHost = turnOrder[0] === playerName;

  // Generate standard B-I-N-G-O letters based on grid size
  const baseBingo = "BINGO";
  const bingoLetters = Array.from({ length: gridSize }, (_, i) => {
    return baseBingo[i % baseBingo.length];
  });

  /* ---------- SYNC & JOIN TRANSAC ---------- */
  useEffect(() => {
    if (!cleanRoomId) return;

    const roomRef = ref(db, `rooms/${cleanRoomId}`);

    const unsubscribe = onValue(roomRef, async (snapshot) => {
      setLoading(false);

      if (!snapshot.exists()) {
        setError("Room does not exist or has been deleted.");
        return;
      }

      const data = snapshot.val();
      setRoomData(data);

      const players = data.players ?? {};

      // If player is already listed in the database players map, sync card
      if (players[playerName]?.card) {
        setCard(players[playerName].card);
        joinedRef.current = true;
        return;
      }

      // If trying to join but game is not in lobby state
      if (data.status !== "LOBBY") {
        setError("This room has already started playing or finished.");
        return;
      }

      // Prevent double local join trigger
      if (joinedRef.current) return;
      joinedRef.current = true;

      // Generate local card
      const newCard = generateBingoCard(data.gridSize);
      setCard(newCard);

      // Join the database room via transaction
      await runTransaction(roomRef, (room) => {
        if (!room) return room;
        room.players ??= {};
        room.turnOrder ??= [];
        room.selectedNumbers ??= [];
        room.winners ??= [];

        if (room.players[playerName]) return room;

        // Check room capacity
        const totalJoined = Object.keys(room.players).length;
        if (totalJoined >= room.maxPlayers) {
          return room; // room full, fail silently
        }

        room.players[playerName] = {
          card: newCard,
          joinedAt: Date.now(),
        };
        room.turnOrder.push(playerName);
        return room;
      });
    });

    return () => unsubscribe();
  }, [roomId, playerName]);

  /* ---------- WIN CHECK & SYNC ---------- */
  useEffect(() => {
    if (!roomData || !card.length || status === "LOBBY") return;

    // Calculate completed lines locally based on synced card
    const linesCompleted = countCompletedLines(card, gridSize);
    setMyLines(linesCompleted);

    const hasWon = checkForWin(card, gridSize);

    if (hasWon && !winners.includes(playerName)) {
      runTransaction(ref(db, `rooms/${cleanRoomId}`), (room) => {
        if (!room) return room;
        room.winners ??= [];
        if (!room.winners.includes(playerName)) {
          room.winners.push(playerName);
        }
        // First player to reach BINGO wins and ends the active game status
        if (room.status === "PLAYING") {
          room.status = "FINISHED";
        }
        return room;
      });
    }
  }, [card, roomData]);

  /* ---------- GAMEPLAY ACTIONS ---------- */
  const handleDaub = async (item) => {
    if (!isMyTurn) return;
    if (status !== "PLAYING") return;
    if (selectedNumbers.includes(item.number)) return;

    const roomRef = ref(db, `rooms/${cleanRoomId}`);
    await runTransaction(roomRef, (room) => {
      if (!room) return room;
      room.selectedNumbers ??= [];
      room.turnOrder ??= [];
      room.currentTurn ??= 0;

      if (room.selectedNumbers.includes(item.number)) return room;

      room.selectedNumbers.push(item.number);

      // Mark the number on everyone's card in the database
      Object.keys(room.players).forEach((pName) => {
        room.players[pName].card = room.players[pName].card.map((cell) =>
          cell.number === item.number ? { ...cell, marked: true } : cell
        );
      });

      // Move turn to the next player
      room.currentTurn = (room.currentTurn + 1) % room.turnOrder.length;

      return room;
    });
  };

  const startGame = async () => {
    if (!isHost) return alert("Only the host can start the game!");
    if (turnOrder.length < 2) {
      return alert("You need at least 2 players in the lobby to start!");
    }

    const roomRef = ref(db, `rooms/${cleanRoomId}`);
    await runTransaction(roomRef, (room) => {
      if (!room) return room;
      room.status = "PLAYING";
      return room;
    });
  };

  const playAgain = async () => {
    const roomRef = ref(db, `rooms/${cleanRoomId}`);
    await runTransaction(roomRef, (room) => {
      if (!room) return room;
      room.status = "LOBBY";
      room.winners = [];
      room.selectedNumbers = [];
      room.currentTurn = 0;

      // Regenerate fresh cards for all players currently in the lobby
      Object.keys(room.players).forEach((pName) => {
        room.players[pName] = {
          card: generateBingoCard(room.gridSize),
          joinedAt: Date.now(),
        };
      });

      return room;
    });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(cleanRoomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leaveRoom = () => {
    navigate("/");
  };

  /* ---------- SUB-RENDER VIEWS ---------- */

  // --- 0. LOADING SCREEN ---
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 bg-grid-pattern text-white flex flex-col items-center justify-center font-orbitron p-4 pt-safe pb-safe">
        <div className="relative w-20 h-20 mb-6">
          <div className="absolute inset-0 border-4 border-purple-500/10 border-t-purple-500 rounded-full animate-spin"></div>
          <div className="absolute inset-2 border-4 border-cyan-500/10 border-t-cyan-400 rounded-full animate-spin [animation-direction:reverse]"></div>
        </div>
        <p className="text-purple-400 text-sm uppercase tracking-[0.2em] animate-pulse">
          Syncing game network...
        </p>
      </div>
    );
  }

  // --- 0. ERROR SCREEN ---
  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 bg-grid-pattern text-white flex flex-col items-center justify-center p-6 text-center pt-safe pb-safe">
        <div className="glass-panel-neon p-8 rounded-3xl border border-red-500/30 max-w-md relative overflow-hidden shadow-[0_0_30px_rgba(239,68,68,0.15)]">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-red-500/50"></div>
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-4 text-red-400">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-red-500 mb-2 tracking-wider font-orbitron">SYSTEM ERROR</h2>
          <p className="text-slate-300 font-inter text-sm mb-6 leading-relaxed">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-500 hover:from-purple-500 hover:to-indigo-400 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-[0_0_15px_rgba(139,92,246,0.3)] btn-pressable font-orbitron text-xs tracking-widest"
          >
            RETURN TO COMMAND CENTER
          </button>
        </div>
      </div>
    );
  }

  // --- 1. PRE-GAME LOBBY VIEW ---
  if (status === "LOBBY") {
    return (
      <div className="min-h-screen bg-slate-950 bg-grid-pattern bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-950/20 via-slate-950 to-black text-white flex flex-col items-center justify-start md:justify-center p-4 pt-safe pb-safe">
        
        {/* Glow ambient background decorator */}
        <div className="absolute top-20 right-10 w-96 h-96 bg-purple-600/5 rounded-full filter blur-[150px] pointer-events-none"></div>

        <div className="w-full max-w-2xl z-10 my-auto">
          
          {/* Header Code Widget */}
          <div className="flex flex-row items-center justify-between gap-4 mb-6">
            <button
              onClick={() => navigate("/")}
              className="text-xs font-semibold text-slate-400 hover:text-white uppercase tracking-wider flex items-center gap-1.5 transition-all btn-pressable"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Exit Room
            </button>

            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-400 font-bold font-orbitron uppercase tracking-widest">
                LOBBY PASSKEY
              </span>
              <div
                onClick={copyCode}
                className="bg-slate-900/90 border border-purple-500/30 pl-4 pr-3.5 py-1.5 rounded-xl cursor-pointer hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(34,211,238,0.25)] active:scale-95 transition-all flex items-center gap-3"
              >
                <span className="font-orbitron font-extrabold text-cyan-400 tracking-widest text-lg">
                  {cleanRoomId}
                </span>
                <span className="text-[9px] bg-slate-800 text-slate-300 font-bold px-2 py-1 rounded font-orbitron">
                  {copied ? "COPIED" : "COPY"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Connected Squad Members list */}
            <div className="md:col-span-7 glass-panel-neon p-6 rounded-3xl border border-purple-500/20 shadow-[0_10px_30px_rgba(139,92,246,0.05)]">
              <div className="flex items-center justify-between mb-4 border-b border-purple-500/10 pb-3">
                <h2 className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 font-orbitron tracking-widest uppercase">
                  SQUAD ROSTER
                </h2>
                <span className="bg-slate-950 border border-slate-800 text-slate-300 text-xs font-bold px-3 py-1 rounded-xl font-orbitron">
                  {turnOrder.length} / {maxPlayers}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-950 rounded-full h-2 mb-6 overflow-hidden border border-slate-900 shadow-inner">
                <div
                  className="bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-400 h-full transition-all duration-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                  style={{ width: `${(turnOrder.length / maxPlayers) * 100}%` }}
                ></div>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {turnOrder.map((name, index) => {
                  const isPlayerHost = index === 0;
                  const isMe = name === playerName;
                  return (
                    <div
                      key={name}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                        isMe
                          ? "bg-purple-950/20 border-purple-500/40 shadow-[inset_0_0_12px_rgba(167,139,250,0.08)]"
                          : "bg-slate-900/50 border-slate-900"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isPlayerHost ? "bg-amber-400" : "bg-green-400"}`}></span>
                          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isPlayerHost ? "bg-amber-500" : "bg-green-500"}`}></span>
                        </span>
                        <span className={`font-semibold text-sm font-inter ${isMe ? "text-purple-300 font-bold" : "text-slate-200"}`}>
                          {name} {isMe && "(You)"}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {isPlayerHost && (
                          <span className="text-[8px] font-black bg-amber-400/10 text-amber-400 border border-amber-400/30 px-2 py-0.5 rounded tracking-widest font-orbitron">
                            HOST
                          </span>
                        )}
                        <span className="text-[8px] font-black bg-green-500/10 text-green-400 border border-green-500/30 px-2 py-0.5 rounded tracking-widest font-orbitron">
                          READY
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Dotted empty slots */}
                {Array.from({ length: maxPlayers - turnOrder.length }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="border border-dashed border-slate-800/80 p-3.5 rounded-2xl flex items-center justify-center text-[10px] text-slate-500 font-bold tracking-[0.15em] font-orbitron uppercase animate-pulse"
                  >
                    WAITING FOR CO-PILOT...
                  </div>
                ))}
              </div>
            </div>

            {/* Game configurations */}
            <div className="md:col-span-5 flex flex-col gap-4">
              <div className="glass-panel p-6 rounded-3xl border border-slate-900 shadow-md">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 font-orbitron">
                  TACTICAL PARAMS
                </h3>
                <div className="space-y-4 text-xs font-inter text-slate-300">
                  <div className="flex justify-between border-b border-slate-900 pb-2">
                    <span className="text-slate-400 font-semibold font-orbitron">Grid Layout:</span>
                    <span className="font-extrabold text-white">{gridSize} x {gridSize}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-2">
                    <span className="text-slate-400 font-semibold font-orbitron">Win Target:</span>
                    <span className="font-extrabold text-yellow-400 font-orbitron tracking-wide">{gridSize} Complete Lines</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-2">
                    <span className="text-slate-400 font-semibold font-orbitron">Capacity:</span>
                    <span className="font-extrabold text-white">{maxPlayers} Max Players</span>
                  </div>
                </div>
                <div className="mt-5 p-3.5 bg-purple-950/15 border border-purple-500/10 rounded-2xl text-[11px] text-purple-300 leading-relaxed font-medium">
                  <strong className="text-purple-400 font-orbitron text-[10px] tracking-wider uppercase block mb-1">How to play:</strong> 
                  Select a cell on your turn. It marks off that number on EVERY player's grid. Claim rows, columns, or diagonals. First to form {gridSize} lines wins the showdown!
                </div>
              </div>

              {/* Start game button */}
              <div className="mt-auto pt-2">
                {isHost ? (
                  <button
                    onClick={startGame}
                    className="w-full bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold py-4 px-6 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.25)] hover:shadow-[0_0_30px_rgba(16,185,129,0.45)] btn-pressable text-xs font-orbitron tracking-[0.2em]"
                  >
                    START BINGO MATCH
                  </button>
                ) : (
                  <div className="w-full bg-slate-900/40 border border-slate-900 p-4 rounded-2xl text-center flex flex-col items-center justify-center shadow-inner">
                    <div className="w-6 h-6 border-2 border-cyan-500/10 border-t-cyan-400 rounded-full animate-spin mb-2"></div>
                    <span className="text-[10px] text-cyan-400 font-bold font-orbitron uppercase tracking-widest animate-pulse">
                      WAITING FOR HOST TO LAUNCH MATCH
                    </span>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // --- 2. ACTIVE GAME ARENA VIEW ---
  if (status === "PLAYING") {
    return (
      <div className="min-h-screen bg-slate-950 bg-grid-pattern bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-950/20 via-slate-950 to-black text-white p-4 md:p-6 lg:p-8 pt-safe pb-safe">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          
          {/* Top Panel: Game Header & Turn tracker banner */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 glass-panel p-4 rounded-3xl border border-slate-900 shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-3">
              <h1 className="text-lg md:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 font-orbitron tracking-wider">
                NEON ARENA
              </h1>
              <span className="bg-slate-950 border border-slate-900 text-slate-400 text-[9px] font-black px-2.5 py-1 rounded-xl font-orbitron tracking-widest uppercase">
                ROOM ID: {cleanRoomId}
              </span>
            </div>

            {/* Glowing active player turn announcer */}
            <div className="flex-grow max-w-md sm:text-center w-full">
              {isMyTurn ? (
                <div className="inline-flex items-center justify-center gap-2 bg-emerald-500/15 border border-emerald-500/35 px-5 py-2 rounded-2xl animate-pulse-glow shadow-[0_0_15px_rgba(16,185,129,0.15)] w-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="font-orbitron font-black text-emerald-400 text-xs tracking-widest uppercase">
                    YOUR TURN — SELECT A NUMBER!
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center justify-center gap-2 bg-slate-950 border border-slate-900 px-5 py-2 rounded-2xl w-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                  </span>
                  <span className="font-inter text-slate-300 text-xs tracking-wide">
                    Waiting for <strong className="text-cyan-400 font-bold font-orbitron">{currentPlayerName}</strong> to pick...
                  </span>
                </div>
              )}
            </div>

            <div className="w-full sm:w-auto text-right">
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to leave the active match?")) {
                    navigate("/");
                  }
                }}
                className="w-full sm:w-auto text-center px-4 py-2 bg-red-950/10 border border-red-500/10 hover:border-red-500/40 rounded-xl text-[10px] font-bold text-slate-400 hover:text-red-400 transition-all font-orbitron tracking-wider btn-pressable"
              >
                LEAVE MATCH
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Scoreboard Left Panel */}
            <div className="lg:col-span-3 glass-panel-neon p-5 rounded-3xl border border-purple-500/15 flex flex-col gap-4 shadow-md">
              <h2 className="text-[10px] font-black tracking-widest text-purple-300 uppercase font-orbitron pb-2 border-b border-purple-500/10">
                SCOREBOARD
              </h2>
              
              <div className="space-y-3 max-h-[220px] lg:max-h-none overflow-y-auto pr-1">
                {turnOrder.map((name, index) => {
                  const isCurrent = index === currentTurn;
                  const isPlayerMe = name === playerName;
                  const hasPlayerWon = winners.includes(name);
                  
                  // Get lines for this player from database
                  const playerObj = roomData?.players?.[name];
                  const playerLinesCount = playerObj?.card
                    ? countCompletedLines(playerObj.card, gridSize)
                    : 0;

                  return (
                    <div
                      key={name}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isCurrent
                          ? "bg-purple-950/30 border-purple-500/50 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                          : "bg-slate-900/60 border-slate-950"
                      } ${hasPlayerWon ? "border-amber-400/40" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isCurrent ? "bg-purple-400 animate-pulse" : "bg-slate-700"
                            }`}
                          ></span>
                          <span className={`font-bold font-inter text-xs truncate max-w-[120px] ${isPlayerMe ? "text-purple-300 font-extrabold" : "text-slate-300"}`}>
                            {name} {isPlayerMe && "(You)"}
                          </span>
                        </div>
                        {isCurrent && (
                          <span className="text-[8px] font-black bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-md tracking-wider uppercase font-orbitron">
                            TURN
                          </span>
                        )}
                      </div>
                      
                      {/* Lines score visual indicator */}
                      <div className="flex items-center justify-between text-[11px] mt-1 text-slate-400">
                        <span>Lines completed:</span>
                        <span className={`font-bold font-orbitron text-xs ${playerLinesCount > 0 ? "text-yellow-400 neon-text-yellow" : "text-slate-500"}`}>
                          {playerLinesCount} / {gridSize}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Called Numbers log */}
              <div className="pt-4 border-t border-purple-500/10 mt-2">
                <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2.5 font-orbitron">
                  CALLED NUMBERS LOG ({selectedNumbers.length})
                </h3>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                  {selectedNumbers.slice(-12).reverse().map((num, i) => (
                    <span
                      key={num}
                      className={`text-xs font-bold font-orbitron w-7 h-7 flex items-center justify-center rounded-lg border ${
                        i === 0
                          ? "bg-gradient-to-br from-pink-500 to-rose-600 border-pink-400 text-white shadow-[0_0_10px_rgba(244,63,94,0.4)] animate-pulse"
                          : "bg-slate-950 border-slate-900 text-slate-500"
                      }`}
                    >
                      {num}
                    </span>
                  ))}
                  {selectedNumbers.length === 0 && (
                    <span className="text-[10px] text-slate-600 italic">No numbers called.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Center Grid Arena */}
            <div className="lg:col-span-6 flex flex-col gap-6 items-center">
              
              {/* B-I-N-G-O Holographic Completion Banner */}
              <div className="flex gap-2.5 justify-center">
                {bingoLetters.map((letter, idx) => {
                  const isCompleted = idx < myLines;
                  return (
                    <div
                      key={idx}
                      className={`w-11 h-11 md:w-12 md:h-12 flex flex-col items-center justify-center border-2 rounded-2xl text-xl md:text-2xl font-black font-orbitron tracking-tighter transition-all duration-500 relative ${
                        isCompleted
                          ? "bg-gradient-to-b from-yellow-400 to-amber-500 border-amber-300 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.6)] transform scale-110"
                          : "border-slate-900 bg-slate-900/50 text-slate-700"
                      }`}
                    >
                      <span>{letter}</span>
                      {isCompleted && (
                        <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-slate-950 animate-ping"></span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Interaction Mode Status Banner */}
              {!isMyTurn && (
                <div className="w-full text-center py-2 bg-slate-900/50 border border-slate-900 rounded-2xl text-[10px] text-cyan-400/80 font-bold uppercase tracking-widest font-orbitron shadow-inner flex items-center justify-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
                  Spectating Match — Opponent turn
                </div>
              )}

              {/* Bingo Card Grid Container */}
              <div className="w-full max-w-md">
                <div
                  className={`grid gap-2.5 p-4 rounded-3xl glass-panel-neon border border-purple-500/10 ${
                    !isMyTurn ? "opacity-80 shadow-none pointer-events-none" : "shadow-[0_15px_30px_rgba(139,92,246,0.08)]"
                  }`}
                  style={{
                    gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
                  }}
                >
                  {card.map((cell) => {
                    const isSelected = selectedNumbers.includes(cell.number) || cell.marked;
                    return (
                      <button
                        key={cell.key}
                        onClick={() => handleDaub(cell)}
                        disabled={!isMyTurn || isSelected}
                        style={{ aspectRatio: "1/1" }}
                        className={`w-full flex items-center justify-center text-base md:text-xl font-bold font-orbitron rounded-xl border transition-all duration-200 shadow-sm ${
                          isSelected
                            ? "bg-gradient-to-br from-emerald-500 to-green-600 border-emerald-400 text-white font-extrabold shadow-[0_0_15px_rgba(16,185,129,0.35)] transform scale-[0.93]"
                            : isMyTurn
                            ? "bg-slate-900/85 hover:bg-purple-950/20 border-slate-800 hover:border-purple-400/60 hover:shadow-[0_0_12px_rgba(167,139,250,0.25)] active:scale-95 text-slate-200 cursor-pointer"
                            : "bg-slate-900/40 border-slate-900/80 text-slate-600 cursor-not-allowed"
                        }`}
                      >
                        {cell.number}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Progress Help Statement */}
              <p className="text-[11px] text-slate-500 font-inter text-center">
                Need <strong className="text-yellow-400 font-bold">{gridSize - myLines}</strong> more line{gridSize - myLines !== 1 && "s"} to claim BINGO victory!
              </p>
            </div>

            {/* Right Side Strategy panel */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              <div className="glass-panel p-5 rounded-3xl border border-slate-900 text-xs leading-relaxed text-slate-400">
                <h3 className="font-black text-slate-300 uppercase font-orbitron mb-2.5 tracking-wider text-[10px]">
                  STRATEGIC COMMAND
                </h3>
                <p className="mb-3.5">
                  Remember: Numbers are shared. Selecting a number marks it on your opponent's card too!
                </p>
                <p className="mb-3.5 font-semibold text-purple-300">
                  Observe lines completed count on the scoreboard.
                </p>
                <p>
                  Pick cells that advance your patterns while keeping your opponents blocked.
                </p>
              </div>

              <div className="glass-panel p-4 rounded-2xl border border-slate-900 text-center">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
                  CURRENT LOAD
                </span>
                <span className="font-orbitron text-base font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                  {selectedNumbers.length} CELLS BLOCKED
                </span>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // --- 3. GAME OVER ARENA VIEW ---
  if (status === "FINISHED") {
    const podiumRanks = ["🥇 GOLD", "🥈 SILVER", "🥉 BRONZE"];
    
    // Generate complete scoreboard for all players in the room
    const playersMap = roomData?.players || {};
    const rankedPlayers = Object.keys(playersMap)
      .map((name) => {
        const pCard = playersMap[name]?.card || [];
        const lines = countCompletedLines(pCard, gridSize);
        const isWinner = winners.includes(name);
        return { name, lines, isWinner };
      })
      .sort((a, b) => {
        if (a.isWinner && !b.isWinner) return -1;
        if (!a.isWinner && b.isWinner) return 1;
        return b.lines - a.lines;
      });

    return (
      <div className="min-h-screen bg-slate-950 bg-grid-pattern bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-950/20 via-slate-950 to-black text-white flex flex-col items-center justify-center p-4 pt-safe pb-safe">
        
        {/* Confetti light glow effect */}
        <div className="absolute w-96 h-96 bg-amber-500/10 rounded-full filter blur-[150px] pointer-events-none animate-pulse-glow"></div>

        <div className="w-full max-w-md glass-panel-neon p-6 md:p-8 rounded-3xl border border-yellow-500/20 text-center z-10 shadow-[0_20px_50px_rgba(245,158,11,0.1)] relative">
          
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent"></div>

          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500 tracking-[0.2em] font-orbitron mb-1 filter drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]">
            MATCH OVER
          </h1>
          <p className="text-slate-500 uppercase tracking-widest text-[9px] font-black mb-6 font-orbitron">
            HOST SERVER COMMUNICATIONS CLOSED
          </p>

          {winners.includes(playerName) ? (
            <div className="mb-6 p-5 bg-emerald-950/25 border border-emerald-500/35 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.15)] max-w-sm mx-auto">
              <span className="text-4xl block mb-2 animate-bounce">🏆</span>
              <h2 className="text-lg font-black text-emerald-400 font-orbitron tracking-widest uppercase">
                VICTORY
              </h2>
              <p className="text-[11px] text-emerald-300 font-inter mt-1">
                You dominated the grid and claimed BINGO!
              </p>
            </div>
          ) : (
            <div className="mb-6 p-5 bg-red-950/20 border border-red-500/20 rounded-2xl shadow-[0_0_20px_rgba(239,68,68,0.05)] max-w-sm mx-auto">
              <span className="text-4xl block mb-2">👾</span>
              <h2 className="text-lg font-black text-red-500 font-orbitron tracking-widest uppercase">
                DEFEATED
              </h2>
              <p className="text-[11px] text-slate-400 font-inter mt-1">
                An opponent claimed BINGO first. Better luck next deployment!
              </p>
            </div>
          )}

          {/* Ranks list */}
          <div className="space-y-3 mb-6 text-left">
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-orbitron mb-2">
              FINAL STANDINGS:
            </h2>
            <div className="max-h-[180px] overflow-y-auto space-y-2.5 pr-1">
              {rankedPlayers.map((player, idx) => {
                const isPlayerMe = player.name === playerName;
                const hasRankIcon = idx < 3;
                return (
                  <div
                    key={player.name}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      isPlayerMe
                        ? "bg-purple-950/25 border-purple-500/35 shadow-[inset_0_0_10px_rgba(167,139,250,0.08)]"
                        : "bg-slate-900/60 border-slate-950"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-orbitron font-black text-xs text-yellow-400">
                        {hasRankIcon ? podiumRanks[idx] : `#${idx + 1}`}
                      </span>
                      <span className={`font-semibold font-inter text-xs ${isPlayerMe ? "text-purple-300 font-extrabold" : "text-white"}`}>
                        {player.name} {isPlayerMe && "(You)"}
                      </span>
                    </div>
                    {player.isWinner ? (
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-400 font-orbitron font-black border border-emerald-500/30 px-2 py-0.5 rounded-lg">
                        BINGO
                      </span>
                    ) : (
                      <span className="text-[10px] bg-slate-950 text-slate-400 font-orbitron font-bold border border-slate-900 px-2.5 py-0.5 rounded-lg">
                        {player.lines} / {gridSize} Lines
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2.5">
            {isHost ? (
              <button
                onClick={playAgain}
                className="w-full bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-400 hover:from-yellow-400 hover:to-amber-400 text-slate-950 font-black py-3.5 px-6 rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.25)] btn-pressable font-orbitron tracking-widest text-xs"
              >
                REDEPLOY MATCH
              </button>
            ) : (
              <div className="w-full bg-slate-900/40 border border-slate-950 p-3.5 rounded-xl text-center flex flex-col items-center justify-center">
                <div className="w-4 h-4 border-2 border-yellow-500/10 border-t-yellow-500 rounded-full animate-spin mb-1.5"></div>
                <span className="text-[9px] text-yellow-400 font-bold font-orbitron uppercase tracking-widest animate-pulse">
                  AWAITING HOST MATCH REDEPLOY
                </span>
              </div>
            )}

            <button
              onClick={leaveRoom}
              className="w-full bg-slate-900/80 hover:bg-slate-800 text-slate-400 border border-slate-950 hover:border-slate-800 font-bold py-3 px-6 rounded-xl transition-all duration-200 font-orbitron text-[10px] tracking-wider btn-pressable"
            >
              RETURN TO COMMAND CENTER
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
