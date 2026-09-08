const COMMANDS = {
  LEFT: "back",
  RIGHT: "forward",
  UP: "scroll-up",
  DOWN: "scroll-down",
  SELECT: "submit",
  SEND: "submit",
  BACK: "back",
  END: "exit",
  TAB: "tabs",
  "TAB-NEXT": "tab-next",
  "TAB-PREVIOUS": "tab-previous",
};

export const getBrowserCommand = (key) => COMMANDS[key] || null;
