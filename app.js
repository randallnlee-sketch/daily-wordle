import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabase = createClient("https://pguyhknljcrnwoidhlzp.supabase.co", "sb_publishable_hi_rSiAXwQqOqhaXsryUHw_pMu5f35I");
const $ = (selector) => document.querySelector(selector);
const keyboardRows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
let puzzle;
let playerId = localStorage.playerId || crypto.randomUUID();
let playerName = localStorage.playerName || "";
let currentRows = [];
let activeGuess = "";
localStorage.playerId = playerId;

function letterStates(rows = []) {
  const rank = { absent: 1, present: 2, correct: 3 };
  const states = new Map();
  rows.forEach(({ guess, feedback }) => [...guess].forEach((letter, index) => {
    const state = feedback[index];
    if (!states.has(letter) || rank[state] > rank[states.get(letter)]) states.set(letter, state);
  }));
  return states;
}
function drawBoard() {
  $("#board").innerHTML = Array.from({ length: 6 }, (_, row) => {
    const guess = currentRows[row]?.guess || (row === currentRows.length ? activeGuess : "");
    const feedback = currentRows[row]?.feedback || [];
    return `<div class="row">${Array.from({ length: 5 }, (_, col) => `<span class="tile ${feedback[col] || ""}">${guess[col] || ""}</span>`).join("")}</div>`;
  }).join("");
}
function drawKeyboard() {
  const states = letterStates(currentRows);
  const row = (letters) => [...letters].map((letter) => `<button type="button" class="key ${states.get(letter) || ""}" data-key="${letter}" aria-label="${letter.toUpperCase()}">${letter}</button>`).join("");
  $("#game-keyboard").innerHTML = `<div class="key-row">${row(keyboardRows[0])}</div><div class="key-row">${row(keyboardRows[1])}</div><div class="key-row"><button type="button" class="key action" data-key="enter">Enter</button>${row(keyboardRows[2])}<button type="button" class="key action" data-key="backspace" aria-label="Delete last letter">⌫</button></div>`;
}
function redraw() { drawBoard(); drawKeyboard(); }
function showMessage(text, error = false) { const el = $("#message"); el.textContent = text; el.classList.toggle("error", error); }
function setKeyboardDisabled(disabled) { document.querySelectorAll("#game-keyboard button").forEach((button) => { button.disabled = disabled; }); }

async function loadPuzzle() {
  const { data, error } = await supabase.rpc("get_today_puzzle");
  if (error || !data?.[0]) { $("#subtitle").textContent = "No puzzle has been published yet. Check back soon."; return; }
  puzzle = data[0];
  $("#subtitle").textContent = new Date(`${puzzle.puzzle_date}T12:00:00`).toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric" });
  redraw();
  if (playerName) { $("#player-name").value = playerName; startGame(); }
}
function startGame() { $("#name-card").classList.add("hidden"); $("#game-card").classList.remove("hidden"); }
async function submitGuess() {
  if (activeGuess.length !== 5) return showMessage("Enter five letters first.", true);
  setKeyboardDisabled(true); showMessage("");
  const { data, error } = await supabase.rpc("submit_guess", { p_puzzle_id:puzzle.id, p_player_id:playerId, p_player_name:playerName, p_guess:activeGuess });
  setKeyboardDisabled(false);
  if (error || !data?.[0]) return showMessage(error?.message || "That didn’t work. Please try again.", true);
  const result = data[0]; currentRows = result.rows; activeGuess = ""; redraw();
  if (result.state === "playing") return showMessage(`${6 - result.guess_count} guesses remaining.`);
  $("#game-keyboard").classList.add("hidden"); $(".keyboard-note").classList.add("hidden"); showMessage(""); showResults(result);
}
function useKey(key) {
  if (key === "enter") return submitGuess();
  if (key === "backspace") { activeGuess = activeGuess.slice(0, -1); showMessage(""); return drawBoard(); }
  if (activeGuess.length < 5) { activeGuess += key; showMessage(""); drawBoard(); }
}

$("#name-form").addEventListener("submit", (event) => { event.preventDefault(); playerName = $("#player-name").value.trim(); if (!playerName) return; localStorage.playerName = playerName; startGame(); });
$("#game-keyboard").addEventListener("click", (event) => { const key = event.target.closest("button")?.dataset.key; if (key) useKey(key); });
document.addEventListener("keydown", (event) => {
  if ($("#game-card").classList.contains("hidden") || event.metaKey || event.ctrlKey || event.altKey) return;
  if (/^[a-zA-Z]$/.test(event.key)) useKey(event.key.toLowerCase());
  else if (event.key === "Backspace") useKey("backspace");
  else if (event.key === "Enter") useKey("enter");
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
