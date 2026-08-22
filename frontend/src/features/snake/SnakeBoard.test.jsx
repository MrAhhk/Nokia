import { act } from "react";
import { createRoot } from "react-dom/client";
import SnakeBoard from "./SnakeBoard";
import { createSnakeGame } from "./snakeEngine";

global.IS_REACT_ACT_ENVIRONMENT = true;

test("keeps the Canvas backing size synchronized with its displayed size", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const size = { width: 300, height: 200 };
  let notifyResize;

  global.ResizeObserver = class ResizeObserver {
    constructor(callback) { notifyResize = callback; }
    observe() {}
    disconnect() {}
  };

  HTMLCanvasElement.prototype.getBoundingClientRect = jest.fn(() => ({
    ...size,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: size.width,
    bottom: size.height,
  }));
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    strokeRect: jest.fn(),
    fillRect: jest.fn(),
  }));

  act(() => root.render(<SnakeBoard game={createSnakeGame({ random: () => 0 })} />));
  const canvas = container.querySelector("canvas");
  expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 300, height: 200 });

  size.width = 340;
  size.height = 260;
  act(() => notifyResize());
  expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 340, height: 260 });

  act(() => root.unmount());
  container.remove();
});
