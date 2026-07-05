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
          return room; // room full, fail silently, onValue will handle
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center font-orbitron">
        <div className="w-16 h-16 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mb-4"></div>
        <p className="text-purple-400 text-lg uppercase tracking-wider animate-pulse">
          Connecting to Bingo Showdown...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="glass-panel-neon p-8 rounded-2xl border border-red-500/30 max-w-md">
          <h2 className="text-3xl font-extrabold text-red-500 mb-4 tracking-wider">ERROR</h2>
          <p className="text-slate-300 font-inter mb-6">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-500 hover:from-purple-500 hover:to-indigo-400 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-[0_0_15px_rgba(139,92,246,0.3)] font-orbitron text-sm"
          >
            RETURN TO LOBBY
          </button>
        </div>
      </div>
    );
  }

  // --- 1. PRE-GAME LOBBY VIEW ---
  if (status === "LOBBY") {
    return (
      <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-slate-950 to-black text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-2xl z-10">
          {/* Header Code Widget */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
            <div>
              <button
                onClick={() => navigate("/")}
                className="text-xs font-semibold text-slate-400 hover:text-white uppercase tracking-wider flex items-center gap-1 transition-all"
              >
                ← Exit Room
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-orbitron uppercase tracking-widest">
                Room Code
              </span>
              <div
                onClick={copyCode}
                className="bg-slate-900 border border-purple-500/30 px-4 py-1.5 rounded-xl cursor-pointer hover:border-cyan-400 hover:shadow-[0_0_10px_rgba(34,211,238,0.2)] active:scale-95 transition-all flex items-center gap-2"
              >
                <span className="font-orbitron font-extrabold text-cyan-400 tracking-wider text-xl">
                  {cleanRoomId}
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-400 font-semibold px-2 py-0.5 rounded font-inter">
                  {copied ? "COPIED!" : "COPY"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Joined Squad Members */}
            <div className="md:col-span-7 glass-panel-neon p-6 rounded-2xl border border-purple-500/20">
              <div className="flex items-center justify-between mb-4 border-b border-purple-500/10 pb-3">
                <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                  CONNECTED PLAYERS
                </h2>
                <span className="bg-slate-900 text-slate-300 text-xs font-semibold px-2.5 py-1 rounded-full font-orbitron border border-slate-800">
                  {turnOrder.length} / {maxPlayers}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-900 rounded-full h-1.5 mb-6 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-purple-500 to-cyan-400 h-full transition-all duration-500"
                  style={{ width: `${(turnOrder.length / maxPlayers) * 100}%` }}
                ></div>
              </div>

              <div className="space-y-3">
                {turnOrder.map((name, index) => {
                  const isPlayerHost = index === 0;
                  const isMe = name === playerName;
                  return (
                    <div
                      key={name}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                        isMe
                          ? "bg-purple-950/20 border-purple-500/40 shadow-[inset_0_0_10px_rgba(167,139,250,0.05)]"
                          : "bg-slate-900/50 border-slate-800/80"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            isPlayerHost ? "bg-amber-400 animate-pulse" : "bg-cyan-400"
                          }`}
                        ></div>
                        <span className={`font-semibold font-inter ${isMe ? "text-purple-300 font-bold" : "text-slate-200"}`}>
                          {name} {isMe && "(You)"}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {isPlayerHost && (
                          <span className="text-[9px] font-bold bg-amber-400/10 text-amber-400 border border-amber-400/30 px-2 py-0.5 rounded uppercase tracking-wider font-orbitron">
                            HOST
                          </span>
                        )}
                        <span className="text-[9px] font-bold bg-green-500/10 text-green-400 border border-green-500/30 px-2 py-0.5 rounded uppercase tracking-wider font-orbitron">
                          READY
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Empty Slots */}
                {Array.from({ length: maxPlayers - turnOrder.length }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="border border-dashed border-slate-800 p-3.5 rounded-xl flex items-center justify-center text-xs text-slate-600 font-medium tracking-wide"
                  >
                    WAITING FOR SQUAD MATE...
                  </div>
                ))}
              </div>
            </div>

            {/* Game Parameters Details */}
            <div className="md:col-span-5 flex flex-col gap-4">
              <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 font-orbitron">
                  GAME RULES
                </h3>
                <div className="space-y-4 text-sm font-inter text-slate-300">
                  <div className="flex justify-between border-b border-slate-900 pb-2">
                    <span className="text-slate-400">Grid Layout:</span>
                    <span className="font-semibold text-white">{gridSize} x {gridSize}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-2">
                    <span className="text-slate-400">Win Condition:</span>
                    <span className="font-semibold text-yellow-400">{gridSize} Complete Lines</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-2">
                    <span className="text-slate-400">Match Capacity:</span>
                    <span className="font-semibold text-white">{maxPlayers} Max Players</span>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-purple-950/10 border border-purple-500/10 rounded-xl text-xs text-purple-300 leading-relaxed">
                  <strong>How to play:</strong> Select a number on your turn to mark it off for EVERY player. Complete rows, columns, or diagonals to claim letters. First to complete {gridSize} lines wins!
                </div>
              </div>

              {/* Start Button Area */}
              <div className="mt-auto">
                {isHost ? (
                  <button
                    onClick={startGame}
                    className="w-full bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-bold py-4 px-6 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.25)] hover:shadow-[0_0_30px_rgba(16,185,129,0.45)] transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 text-sm font-orbitron tracking-widest text-center"
                  >
                    START BINGO MATCH
                  </button>
                ) : (
                  <div className="w-full bg-slate-900/60 border border-slate-800 p-4 rounded-xl text-center flex flex-col items-center justify-center">
                    <div className="w-5 h-5 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-2"></div>
                    <span className="text-xs text-cyan-400 font-orbitron uppercase tracking-widest animate-pulse">
                      WAITING FOR HOST TO START...
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
      <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-slate-950 to-black text-white p-4 md:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          
          {/* Top Panel: Banner & Turn Tracker */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 glass-panel p-4 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-3">
              <h1 className="text-xl md:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 font-orbitron tracking-wider">
                NEON SHOWDOWN
              </h1>
              <span className="bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded font-orbitron tracking-widest uppercase">
                ROOM: {cleanRoomId}
              </span>
            </div>

            {/* Glowing Turn Announcer */}
            <div className="flex-grow max-w-md md:text-center">
              {isMyTurn ? (
                <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-6 py-2 rounded-xl animate-pulse-glow shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></div>
                  <span className="font-orbitron font-extrabold text-emerald-400 text-sm tracking-widest uppercase">
                    YOUR TURN! CHOOSE A NUMBER
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 bg-slate-900 border border-slate-800 px-6 py-2 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
                  <span className="font-inter text-slate-300 text-xs tracking-wider">
                    Waiting for <strong className="text-cyan-400 font-semibold">{currentPlayerName}</strong> to daub...
                  </span>
                </div>
              )}
            </div>

            <div>
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to leave the active match?")) {
                    navigate("/");
                  }
                }}
                className="text-xs font-semibold text-slate-500 hover:text-red-400 transition-all font-orbitron tracking-wider"
              >
                LEAVE MATCH
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Player Live Progress Board */}
            <div className="lg:col-span-3 glass-panel-neon p-5 rounded-2xl border border-purple-500/20 flex flex-col gap-4">
              <h2 className="text-xs font-black tracking-widest text-purple-300 uppercase font-orbitron pb-2 border-b border-purple-500/10">
                SCOREBOARD
              </h2>
              <div className="space-y-3">
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
                      className={`p-3.5 rounded-xl border transition-all ${
                        isCurrent
                          ? "bg-purple-950/20 border-purple-500/50 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                          : "bg-slate-900/60 border-slate-800/80"
                      } ${hasPlayerWon ? "border-amber-400/40" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isCurrent ? "bg-purple-400 animate-ping" : "bg-slate-600"
                            }`}
                          ></span>
                          <span className={`font-semibold font-inter text-sm truncate max-w-[120px] ${isPlayerMe ? "text-purple-300 font-bold" : "text-slate-200"}`}>
                            {name} {isPlayerMe && "(You)"}
                          </span>
                        </div>
                        {isCurrent && (
                          <span className="text-[8px] font-black bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded tracking-wider uppercase font-orbitron">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      {/* Lines score indicator */}
                      <div className="flex items-center justify-between text-xs mt-2 text-slate-400">
                        <span>Lines completed:</span>
                        <span className={`font-bold font-orbitron ${playerLinesCount > 0 ? "text-yellow-400 neon-text-yellow" : "text-slate-500"}`}>
                          {playerLinesCount} / {gridSize}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Called Numbers Log */}
              <div className="mt-auto pt-4 border-t border-purple-500/10">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 font-orbitron">
                  CALLED LOG ({selectedNumbers.length})
                </h3>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                  {selectedNumbers.slice(-12).reverse().map((num, i) => (
                    <span
                      key={num}
                      className={`text-xs font-bold font-orbitron w-6.5 h-6.5 flex items-center justify-center rounded-lg border ${
                        i === 0
                          ? "bg-pink-500 border-pink-400 text-white shadow-[0_0_8px_rgba(244,63,94,0.3)] animate-pulse"
                          : "bg-slate-900 border-slate-800 text-slate-400"
                      }`}
                    >
                      {num}
                    </span>
                  ))}
                  {selectedNumbers.length === 0 && (
                    <span className="text-xs text-slate-600 italic">No numbers called yet.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Center Column: Bingo Card / Grid */}
            <div className="lg:col-span-6 flex flex-col gap-6 items-center">
              
              {/* B-I-N-G-O letters completion visual display */}
              <div className="flex gap-3 justify-center">
                {bingoLetters.map((letter, idx) => {
                  const isCompleted = idx < myLines;
                  return (
                    <div
                      key={idx}
                      className={`w-12 h-12 flex flex-col items-center justify-center border-2 rounded-xl text-2xl font-black font-orbitron tracking-tighter transition-all duration-500 ${
                        isCompleted
                          ? "bg-gradient-to-b from-yellow-400 to-amber-500 border-amber-300 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.5)] transform scale-110"
                          : "border-slate-800 bg-slate-900/40 text-slate-600"
                      }`}
                    >
                      <span>{letter}</span>
                      {isCompleted && (
                        <span className="w-1 h-1 rounded-full bg-slate-900 animate-ping"></span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Interaction Warning Panel */}
              {!isMyTurn && (
                <div className="w-full text-center py-2 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs text-cyan-400 uppercase tracking-widest font-orbitron">
                  ⚠️ View Mode Only — Opponent is Deciding
                </div>
              )}

              {/* The Bingo Grid */}
              <div className="w-full max-w-md">
                <div
                  className={`grid gap-3 p-4 rounded-2xl glass-panel-neon border border-purple-500/10 ${
                    !isMyTurn ? "opacity-90 shadow-none pointer-events-none" : "shadow-[0_0_30px_rgba(167,139,250,0.05)]"
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
                        className={`w-full flex items-center justify-center text-lg md:text-xl font-bold font-orbitron rounded-xl border transition-all duration-200 ${
                          isSelected
                            ? "bg-gradient-to-br from-emerald-500 to-green-600 border-emerald-400 text-white font-extrabold shadow-[0_0_15px_rgba(16,185,129,0.3)] transform scale-95"
                            : isMyTurn
                            ? "bg-slate-900/70 hover:bg-purple-900/20 border-slate-800/80 hover:border-purple-400 hover:shadow-[0_0_10px_rgba(167,139,250,0.2)] active:scale-95 text-slate-300"
                            : "bg-slate-900/40 border-slate-900 text-slate-500 cursor-not-allowed"
                        }`}
                      >
                        {cell.number}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Progress Statement */}
              <p className="text-xs text-slate-500 font-inter text-center">
                Need to complete <strong className="text-yellow-500 font-semibold">{gridSize - myLines}</strong> more line{gridSize - myLines !== 1 && "s"} to trigger BINGO!
              </p>
            </div>

            {/* Right Column: Player Side Info & Live Help */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              {/* Help box */}
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 text-xs leading-relaxed text-slate-400">
                <h3 className="font-bold text-slate-300 uppercase font-orbitron mb-2 tracking-wide">
                  CUT-THROAT TACTICS
                </h3>
                <p className="mb-3">
                  This isn't standard bingo. You share the selected numbers! 
                </p>
                <p className="mb-3">
                  Keep a close watch on your opponent's card layouts by looking at their completed lines on the left.
                </p>
                <p>
                  Avoid picking numbers that complete their lines, or pick numbers that block their progress while helping your own!
                </p>
              </div>

              {/* Status panel */}
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
                  CURRENT BOARD STATE
                </span>
                <span className="font-orbitron text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
                  {selectedNumbers.length} NUMS DAUBED
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
      <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-slate-950 to-black text-white flex flex-col items-center justify-center p-4">
        
        {/* Animated Background Confetti Light effect */}
        <div className="absolute w-96 h-96 bg-yellow-500 rounded-full filter blur-[150px] opacity-10 pointer-events-none animate-pulse-glow"></div>

        <div className="w-full max-w-lg glass-panel-neon p-8 rounded-3xl border border-yellow-500/30 text-center z-10">
          
          <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500 tracking-widest font-orbitron mb-2 filter drop-shadow-[0_2px_15px_rgba(245,158,11,0.4)]">
            GAME OVER
          </h1>
          <p className="text-slate-400 uppercase tracking-widest text-xs font-semibold mb-6 font-orbitron">
            THE RESULTS ARE IN
          </p>

          {winners.includes(playerName) ? (
            <div className="mb-8 p-6 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.15)] max-w-sm mx-auto">
              <span className="text-4xl block mb-2 animate-bounce">🏆</span>
              <h2 className="text-xl font-black text-emerald-400 font-orbitron tracking-widest uppercase">
                VICTORY!
              </h2>
              <p className="text-xs text-emerald-300 font-inter mt-1.5">
                Congratulations, you completed the grid and claimed BINGO!
              </p>
            </div>
          ) : (
            <div className="mb-8 p-6 bg-red-950/20 border border-red-500/20 rounded-2xl shadow-[inset_0_0_15px_rgba(239,68,68,0.05)] max-w-sm mx-auto">
              <span className="text-4xl block mb-2">💀</span>
              <h2 className="text-xl font-black text-red-500 font-orbitron tracking-widest uppercase">
                DEFEAT
              </h2>
              <p className="text-xs text-slate-400 font-inter mt-1.5">
                An opponent claimed BINGO first. Better luck next showdown!
              </p>
            </div>
          )}

          {/* Winner Podium List */}
          <div className="space-y-4 mb-8">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-orbitron text-left mb-3">
              Final Ranks:
            </h2>
            {rankedPlayers.map((player, idx) => {
              const isPlayerMe = player.name === playerName;
              const hasRankIcon = idx < 3;
              return (
                <div
                  key={player.name}
                  className={`flex items-center justify-between p-4 rounded-xl border ${
                    isPlayerMe
                      ? "bg-purple-950/20 border-purple-500/30 shadow-[inset_0_0_10px_rgba(167,139,250,0.1)]"
                      : "bg-slate-900/60 border-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-orbitron font-extrabold text-sm text-yellow-400">
                      {hasRankIcon ? podiumRanks[idx] : `#${idx + 1}`}
                    </span>
                    <span className={`font-semibold font-inter text-sm ${isPlayerMe ? "text-purple-300 font-bold" : "text-white"}`}>
                      {player.name} {isPlayerMe && "(You)"}
                    </span>
                  </div>
                  {player.isWinner ? (
                    <span className="text-xs bg-emerald-500/10 text-emerald-400 font-orbitron font-bold border border-emerald-500/30 px-3 py-1 rounded-lg">
                      BINGO!
                    </span>
                  ) : (
                    <span className="text-xs bg-slate-950 text-slate-400 font-orbitron font-bold border border-slate-800 px-3 py-1 rounded-lg">
                      {player.lines} / {gridSize} Lines
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            {isHost ? (
              <button
                onClick={playAgain}
                className="w-full bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-slate-950 font-black py-4 px-6 rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_30px_rgba(245,158,11,0.5)] transition-all duration-300 font-orbitron tracking-widest text-sm"
              >
                PLAY ANOTHER ROUND
              </button>
            ) : (
              <div className="w-full bg-slate-900/60 border border-slate-850 p-4 rounded-xl text-center flex flex-col items-center justify-center">
                <div className="w-4 h-4 border-2 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin mb-2"></div>
                <span className="text-[10px] text-yellow-400 font-orbitron uppercase tracking-widest animate-pulse">
                  WAITING FOR HOST TO PLAY AGAIN...
                </span>
              </div>
            )}

            <button
              onClick={leaveRoom}
              className="w-full bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 font-bold py-3.5 px-6 rounded-xl transition-all duration-200 font-orbitron text-xs tracking-wider"
            >
              RETURN TO LOBBY
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return null;
}
