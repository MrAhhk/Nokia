const COMMANDS = {
  LEFT: "back",
  "4": "back",
  RIGHT: "forward",
  "6": "forward",
  UP: "scroll-up",
  "2": "scroll-up",
  DOWN: "scroll-down",
  "8": "scroll-down",
  SELECT: "focus-address",
  "5": "focus-address",
  SEND: "focus-address",
  "*": "reload",
  END: "exit",
  "#": "exit",
};

export const getBrowserCommand = (key) => COMMANDS[key] || null;
