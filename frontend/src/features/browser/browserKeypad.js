import { createMultiTapComposer } from "../../domain/multiTapComposer";
import { NOKIA_MULTI_TAP_CYCLES } from "../../domain/keyGrammar";
import { getBrowserCommand } from "./browserCommands";

export const BROWSER_MULTI_TAP_CYCLES = NOKIA_MULTI_TAP_CYCLES;

export const createBrowserKeypadController = ({
  send,
  onExit = () => {},
  delay = 500,
  getCapsLock = () => false,
  onCapsLockToggle = () => {},
}) => {
  const composer = createMultiTapComposer({
    cycles: BROWSER_MULTI_TAP_CYCLES,
    delay,
    onPreview: (text) => {
      if (text) send("input-preview", { text: getCapsLock() ? text.toUpperCase() : text });
    },
    onCommit: (text) => send("input-commit", { text: getCapsLock() ? text.toUpperCase() : text }),
  });

  const handleKey = (key) => {
    if (composer.press(key)) return;

    if (key === "DELETE") {
      if (composer.cancelPending()) send("input-cancel-preview", {});
      else send("backspace", {});
      return;
    }

    if (key === "*") {
      composer.commit();
      send("input-text", { text: "*" });
      return;
    }

    if (key === "0") {
      composer.commit();
      send("input-text", { text: " " });
      return;
    }

    if (key === "#" || key === "CAPS_LOCK") {
      composer.commit();
      onCapsLockToggle();
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
