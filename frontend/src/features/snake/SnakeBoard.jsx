import { useEffect, useRef } from "react";
import { GRID_COLUMNS, GRID_ROWS } from "./snakeConfig";

const SnakeBoard = ({ game }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(280, Math.round((rect.width || 320) * ratio));
    const height = Math.max(180, Math.round((rect.height || 210) * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const cssWidth = width / ratio;
    const cssHeight = height / ratio;
    const cellSize = Math.min((cssWidth - 8) / GRID_COLUMNS, (cssHeight - 8) / GRID_ROWS);
    const boardWidth = cellSize * GRID_COLUMNS;
    const boardHeight = cellSize * GRID_ROWS;
    const offsetX = Math.floor((cssWidth - boardWidth) / 2);
    const offsetY = Math.floor((cssHeight - boardHeight) / 2);
    const ink = getComputedStyle(canvas).getPropertyValue("--ink").trim() || "#111803";

    context.clearRect(0, 0, cssWidth, cssHeight);
    context.strokeStyle = ink;
    context.lineWidth = 1.5;
    context.strokeRect(offsetX - 2, offsetY - 2, boardWidth + 4, boardHeight + 4);

    const drawCell = (cell, inset = 1) => {
      context.fillStyle = ink;
      context.fillRect(
        Math.round(offsetX + cell.x * cellSize + inset),
        Math.round(offsetY + cell.y * cellSize + inset),
        Math.max(1, Math.ceil(cellSize - inset * 2)),
        Math.max(1, Math.ceil(cellSize - inset * 2)),
      );
    };

    game.snake.forEach((cell, index) => drawCell(cell, index === 0 ? 0.5 : 1));
    if (game.normalFood) drawCell(game.normalFood, Math.max(1, cellSize * 0.28));
    game.bonus?.cells.forEach((cell) => drawCell(cell, 0.5));
  }, [game]);

  const bonusSeconds = game.bonus
    ? Math.max(0, Math.ceil((8000 - game.bonus.elapsedMs) / 1000))
    : 0;
  return (
    <canvas
      ref={canvasRef}
      className="snake-board"
      role="img"
      aria-label={`Snake level ${game.level}, score ${game.score}, status ${game.status}, bonus ${bonusSeconds} seconds`}
    />
  );
};

export default SnakeBoard;
