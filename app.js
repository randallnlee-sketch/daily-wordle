import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabaseUrl = "https://pguyhknljcrnwoidhlzp.supabase.co";
const supabaseKey = "sb_publishable_hi_rSiAXwQqOqhaXsryUHw_pMu5f35I";
const supabase = createClient(supabaseUrl, supabaseKey);
const $ = (selector) => document.querySelector(selector);
let puzzle;
let playerId = localStorage.playerId || crypto.randomUUID();
let playerName = localStorage.playerName || "";
localStorage.playerId = playerId;

function drawBoard(rows = []) {
  $("#board").innerHTML = Array.from({ length: 6 }, (_, row) => {
    const guess = rows[row]?.guess || "";
    const feedback = rows[row]?.feedback || [];
    return `<div class="row">${Array.from({ length: 5 }, (_, col) => `<span class="tile ${feedback[col] || ""}">${guess[col] || ""}</span>`).join("")}</div>`;
  }).join("");
}
function drawLetterStatus(rows = []) {
  const rank = { absent: 1, present: 2, correct: 3 };
  const letters = new Map();
  rows.forEach(({ guess, feedback }) => [...guess].forEach((letter, index) => {
    const state = feedback[index];
    if (!letters.has(letter) || rank[state] > rank[letters.get(letter)]) letters.set(letter, state);
  }));
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  $("#used-letters").innerHTML = letters.size
    ? [...letters].sort().map(([letter, state]) => `<i class="letter ${state}">${letter.toUpperCase()}</i>`).join("")
    : "—";
  $("#remaining-letters").textContent = [...alphabet].filter((letter) => !letters.has(letter)).map((letter) => letter.toUpperCase()).join(" ") || "—";
}
function showMessage(text, error = false) { const el = $("#message"); el.textContent = text; el.classList.toggle("error", error); }

async function loadPuzzle() {
  const { data, error } = await supabase.rpc("get_today_puzzle");
  if (error || !data?.[0]) { $("#subtitle").textContent = "No puzzle has been published yet. Check back soon."; return; }
  puzzle = data[0];
  $("#subtitle").textContent = new Date(`${puzzle.puzzle_date}T12:00:00`).toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric" });
  drawBoard(); drawLetterStatus();
  if (playerName) { $("#player-name").value = playerName; startGame(); }
}
function startGame() { $("#name-card").classList.add("hidden"); $("#game-card").classList.remove("hidden"); $("#guess").focus(); }

$("#name-form").addEventListener("submit", (event) => { event.preventDefault(); playerName = $("#player-name").value.trim(); if (!playerName) return; localStorage.playerName = playerName; startGame(); });
$("#guess-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const guess = $("#guess").value.trim().toLowerCase();
  if (!/^[a-z]{5}$/.test(guess)) return showMessage("Please enter a five-letter word.", true);
  $("#guess-button").disabled = true; showMessage("");
  const { data, error } = await supabase.rpc("submit_guess", { p_puzzle_id:puzzle.id, p_player_id:playerId, p_player_name:playerName, p_guess:guess });
  $("#guess-button").disabled = false;
  if (error || !data?.[0]) return showMessage(error?.message || "That didn’t work. Please try again.", true);
  const result = data[0]; drawBoard(result.rows); drawLetterStatus(result.rows); $("#guess").value = "";
  if (result.state === "playing") { showMessage(`${6 - result.guess_count} guesses remaining.`); $("#guess").focus(); return; }
  $("#guess-form").classList.add("hidden"); showMessage(""); showResults(result);
});
async function showResults(result) {
  $("#results-card").classList.remove("hidden");
  $("#result-heading").textContent = result.state === "won" ? "You got it!" : `The word was ${result.answer.toUpperCase()}.`;
  $("#result-copy").textContent = result.state === "won" ? `Solved in ${result.guess_count} guess${result.guess_count === 1 ? "" : "es"}.` : "Tomorrow brings a fresh word.";
  const { data } = await supabase.rpc("get_puzzle_stats", { p_puzzle_id:puzzle.id }); const stats = data?.[0] || {};
  $("#stats").innerHTML = [[stats.players || 0,"players"],[stats.solved || 0,"solved"],[stats.average_guesses || "—","avg. guesses"]].map(([value,label]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`).join("");
}
$("#play-again").addEventListener("click", () => $("#game-card").scrollIntoView({ behavior:"smooth" }));
loadPuzzle();
