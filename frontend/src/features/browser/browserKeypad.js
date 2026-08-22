import { createMultiTapComposer } from "../../domain/multiTapComposer";
import { getBrowserCommand } from "./browserCommands";

export const BROWSER_MULTI_TAP_CYCLES = {
  "1": [".", ",", "?", "!", "1"],
  "2": ["A", "B", "C", "2"],
  "3": ["D", "E", "F", "3"],
  "4": ["G", "H", "I", "4"],
  "5": ["J", "K", "L", "5"],
  "6": ["M", "N", "O", "6"],
  "7": ["P", "Q", "R", "S", "7"],
  "8": ["T", "U", "V", "8"],
  "9": ["W", "X", "Y", "Z", "9"],
};

export const createBrowserKeypadController = ({
  send,
  onExit = () => {},
  delay = 500,
}) => {
  const composer = createMultiTapComposer({
    cycles: BROWSER_MULTI_TAP_CYCLES,
    delay,
    onPreview: (text) => {
      if (text) send("input-preview", { text });
    },
    onCommit: (text) => send("input-commit", { text }),
  });

  const handleKey = (key) => {
    if (composer.press(key)) return;

    if (key === "*") {
      if (composer.cancelPending()) send("input-cancel-preview", {});
      else send("backspace", {});
      return;
    }

    if (key === "0") {
      composer.commit();
      send("input-text", { text: " " });
      return;
    }

    const command = getBrowserCommand(key);
    if (!command) return;
    composer.commit();
    if (command === "exit") onExit();
    else send(command, {});
  };

  return {
    handleKey,
    dispose: () => composer.dispose(),
  };
};
