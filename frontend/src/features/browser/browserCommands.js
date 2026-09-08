const COMMANDS = {
  LEFT: "back",
  RIGHT: "forward",
  UP: "scroll-up",
  DOWN: "scroll-down",
  SELECT: "submit",
  SEND: "submit",
  END: "exit",
  "#": "tabs",
};

export const getBrowserCommand = (key) => COMMANDS[key] || null;
