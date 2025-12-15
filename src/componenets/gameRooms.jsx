import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ref, onValue, runTransaction } from "firebase/database";
import { db } from "../firebase";
import { generateBingoCard, countCompletedLines } from "../utils/bingoUtils";

export default function GameRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const playerName = localStorage.getItem("bingoPlayerName") || "Guest";

  const [roomData, setRoomData] = useState(null);
  const [card, setCard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const joinedRef = useRef(false);

  const turnOrder = roomData?.turnOrder || [];
  const currentTurn = roomData?.currentTurn ?? 0;
  const isMyTurn = turnOrder[currentTurn] === playerName;
  const currentPlayerName = turnOrder[currentTurn] || "Waiting...";

  /* ---------- JOIN & SYNC ---------- */
  useEffect(() => {
    if (!roomId) return;

    const roomRef = ref(db, `rooms/${roomId.toUpperCase()}`);

    const unsubscribe = onValue(roomRef, async (snapshot) => {
      setLoading(false);

      if (!snapshot.exists()) {
        setError("Room does not exist");
        return;
      }

      const data = snapshot.val();
      setRoomData(data);

      const players = data.players ?? {};

      if (players[playerName]?.card) {
        setCard(players[playerName].card);
        joinedRef.current = true;
        return;
      }

      if (joinedRef.current) return;
      joinedRef.current = true;

      const newCard = generateBingoCard(data.gridSize);
      setCard(newCard);

      await runTransaction(roomRef, (room) => {
        if (!room) return room;

        room.players ??= {};
        room.turnOrder ??= [];
        room.currentTurn ??= 0;
        room.winners ??= [];

        if (room.players[playerName]) return room;
        if (Object.keys(room.players).length >= room.maxPlayers) return room;

        room.players[playerName] = {
          card: newCard,
          joinedAt: Date.now(),
          lines: 0,
        };
        room.turnOrder.push(playerName);
        return room;
      });
    });

    return () => unsubscribe();
  }, [roomId, playerName]);

  /* ---------- NUMBER CLICK ---------- */
  const handleDaub = async (indexNumber) => {
    if (!isMyTurn) return alert("Wait for your turn");
    if (roomData?.status === "FINISHED") return;

    await runTransaction(ref(db, `rooms/${roomId}`), (room) => {
      if (!room) return room;

      room.players ??= {};
      room.turnOrder ??= [];
      room.currentTurn ??= 0;
      room.winners ??= [];

      // MARK THE NUMBER ON ALL PLAYERS
      Object.values(room.players).forEach((player) => {
        player.card.forEach((cell) => {
          if (cell.number === indexNumber) cell.marked = true;
        });

        // Count completed lines
        const lines = countCompletedLines(player.card, room.gridSize);
        player.lines = lines;

        // Check if player completed full BINGO
        if (!room.winners.includes(playerName) && lines >= room.gridSize) {
          room.winners.push(playerName);
          room.status = "FINISHED"; // Stop game when first full BINGO
        }
      });

      // Advance turn
      room.currentTurn = (room.currentTurn + 1) % room.turnOrder.length;

      return room;
    });
  };

  if (loading)
    return (
      <div className="text-center p-10 text-white text-xl">
        Connecting to Bingo Hall...
      </div>
    );

  if (error)
    return (
      <div className="text-center p-10 text-red-500 font-bold text-xl">
        {error}
        <button
          onClick={() => navigate("/")}
          className="underline block mt-4 p-2 bg-blue-500 rounded">
          Go to Lobby
        </button>
      </div>
    );

  const generateBingoLetters = (size) => {
    const base = ["B", "I", "N", "G", "O"];
    const letters = [];

    for (let i = 0; i < size; i++) {
      letters.push(base[i % base.length]); // repeat letters
    }

    return letters;
  };

  const bingoLetters = generateBingoLetters(roomData.gridSize);

  const completedLines = roomData?.players?.[playerName]?.lines || 0;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-4xl font-extrabold mb-2 text-yellow-400">
        Room: {roomId.toUpperCase()}
      </h1>

      <p className="mb-4 text-lg text-green-400">
        Current Turn: {currentPlayerName} {isMyTurn && "(Your turn)"}
      </p>

      {/* Player List */}
      <div className="bg-gray-800 p-4 rounded-lg mb-6">
        <h2 className="text-xl font-bold mb-3">Players</h2>
        {turnOrder.map((name, index) => {
          const isTurn = index === currentTurn;
          const isWinner = roomData?.winners?.includes(name);
          return (
            <div
              key={name}
              className={`flex justify-between p-2 rounded mb-1
                ${isTurn ? "bg-green-600" : "bg-gray-700"}
                ${isWinner ? "line-through text-yellow-400" : ""}`}>
              <span>{name}</span>
              {isTurn && <span className="font-bold">🎯 Turn</span>}
            </div>
          );
        })}
      </div>

      {/* Bingo Grid */}
      <div
        className="grid gap-2 max-w-sm mx-auto mb-6"
        style={{ gridTemplateColumns: `repeat(${roomData.gridSize}, 1fr)` }}>
        {card.map((item) => (
          <div
            key={item.key}
            onClick={() =>
              !item.marked && isMyTurn ? handleDaub(item.number) : null
            }
            className={`
      p-4 text-center font-bold text-xl rounded
      ${item.marked ? "bg-green-500" : "bg-gray-700 hover:bg-gray-600"}
      ${
        !isMyTurn || item.marked
          ? "opacity-50 cursor-not-allowed"
          : "cursor-pointer"
      }
    `}>
            {item.number}
          </div>
        ))}
      </div>

      {/* B I N G O Letters */}
      <div className="fixed top-4 right-4 bg-gray-800 p-4 rounded-lg">
        <div className="flex gap-2 text-3xl font-extrabold">
          {bingoLetters.map((letter, index) => (
            <span
              key={letter}
              className={
                index < completedLines
                  ? "text-green-400 line-through"
                  : "text-gray-500"
              }>
              {letter}
            </span>
          ))}
        </div>
      </div>

      {/* Winners */}
      {roomData?.winners?.length > 0 && (
        <div className="bg-yellow-300 text-gray-900 p-4 rounded-lg mb-6">
          <h2 className="text-2xl font-bold mb-2">🏆 Winners</h2>
          {roomData.winners.map((name, index) => (
            <p key={name} className="text-lg font-bold">
              {index === 0 && "🥇 "}
              {index === 1 && "🥈 "}
              {index === 2 && "🥉 "}
              {name}
            </p>
          ))}
        </div>
      )}

      {/* Finished Overlay */}
      {roomData?.status === "FINISHED" && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center">
          <div className="bg-yellow-300 text-gray-900 p-10 rounded-xl text-center">
            <h2 className="text-5xl font-extrabold mb-4">GAME OVER</h2>
            <p className="text-3xl font-bold">Winners Listed Above 🏆</p>
            <button
              onClick={() => navigate("/")}
              className="mt-6 p-3 bg-red-600 text-white rounded">
              Go to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
