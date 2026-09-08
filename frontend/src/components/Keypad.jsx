import { memo, useRef, useCallback, useEffect } from "react";
import { 
  Phone, 
  PhoneOff, 
  ChevronUp, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight, 
  Circle,
  Delete,
  Globe2,
  House,
  Music2
} from "lucide-react";

const Keypad = ({ onKeypadPress, variant = "default" }) => {
  const lastPressRef = useRef({ key: null, time: 0 });

  const keys = [
    { number: "1", letters: "" },
    { number: "2", letters: "ABC", icon: ChevronUp },
    { number: "3", letters: "DEF" },
    { number: "4", letters: "GHI", icon: ChevronLeft },
    { number: "5", letters: "JKL", icon: Circle },
    { number: "6", letters: "MNO", icon: ChevronRight },
    { number: "7", letters: "PQRS" },
    { number: "8", letters: "TUV", icon: ChevronDown },
    { number: "9", letters: "WXYZ" },
    { number: "*", letters: "+", icon: Delete },
    { number: "0", letters: "_" },
    { number: "#", letters: "BACK" },
  ];

  const handleKeyPress = useCallback((keyNumber) => {
    const now = Date.now();
    if (lastPressRef.current.key === keyNumber && now - lastPressRef.current.time < 30) {
      return;
    }
    lastPressRef.current = { key: keyNumber, time: now };
    onKeypadPress(keyNumber);
  }, [onKeypadPress]);

  const recentPointerRef = useRef(new Map());

  const handlePointerDown = useCallback((key) => {
    recentPointerRef.current.set(key, Date.now());
    handleKeyPress(key);
  }, [handleKeyPress]);

  const handleClick = useCallback((key) => {
    const lastTime = recentPointerRef.current.get(key) || 0;
    if (Date.now() - lastTime < 450) {
      return;
    }
    handleKeyPress(key);
  }, [handleKeyPress]);

  if (variant === "launcher") {
    return (
      <LauncherKeypad
        onPress={handleKeyPress}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 md:gap-4 h-full w-full max-w-[400px]" data-testid="keypad">
      {/* Top Row: Nokia Control Keys */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {/* Green Call Button */}
        <button
          data-testid="keypad-btn-send"
          onPointerDown={() => handlePointerDown("SEND")}
          onClick={() => handleClick("SEND")}
          className={`
            flex items-center justify-center h-12 md:h-14 rounded-md border 
            shadow-[0_4px_0_rgba(34,197,94,0.1)] active:translate-y-[4px] active:shadow-none 
            border-green-500/20 bg-green-950/30 text-green-500
          `}
        >
          <Phone className="h-6 w-6" />
        </button>

        {/* Center Select Button */}
        <button
          data-testid="keypad-btn-select"
          onPointerDown={() => handlePointerDown("SELECT")}
          onClick={() => handleClick("SELECT")}
          className={`
            flex items-center justify-center h-12 md:h-14 rounded-md border 
            shadow-[0_4px_0_rgba(255,255,255,0.05)] active:translate-y-[4px] active:shadow-none 
            border-white/10 bg-[#111] text-white
          `}
        >
          <span className="text-xs md:text-sm font-bold tracking-widest">SELECT</span>
        </button>

        {/* Red End Call Button */}
        <button
          data-testid="keypad-btn-end"
          onPointerDown={() => handlePointerDown("END")}
          onClick={() => handleClick("END")}
          className={`
            flex items-center justify-center h-12 md:h-14 rounded-md border 
            shadow-[0_4px_0_rgba(239,68,68,0.1)] active:translate-y-[4px] active:shadow-none 
            border-red-500/20 bg-red-950/30 text-red-500
          `}
        >
          <PhoneOff className="h-6 w-6" />
        </button>
      </div>

      {/* Numeric Key Grid */}
      <div className="grid grid-cols-3 grid-rows-4 gap-3 md:gap-4 flex-1">
        {keys.map((key) => {
          const KeyIcon = key.icon;
          return (
            <button
              key={key.number}
              data-testid={`keypad-btn-${key.number === "*" ? "star" : key.number === "#" ? "hash" : key.number}`}
              onPointerDown={() => handlePointerDown(key.number)}
              onClick={() => handleClick(key.number)}
              className={`
                relative flex flex-col items-center justify-center rounded-md border border-white/10 
                shadow-[0_4px_0_rgba(255,255,255,0.05)] active:translate-y-[4px] active:shadow-none 
                bg-[#111] text-white
              `}
            >
              {/* Number and Arrow/Icon Container */}
              <div className="flex items-center gap-1">
                {/* Arrow indicator on Left side for 4, and Right side for 6 */}
                {KeyIcon && (key.number === "4" || key.number === "*") && (
                  <KeyIcon className="h-4 w-4 opacity-70" />
                )}

                {/* Arrow indicator on Top for 2 */}
                {KeyIcon && key.number === "2" && (
                  <div className="flex flex-col items-center justify-center">
                    <KeyIcon className="h-4 w-4 opacity-70 mb-0.5" />
                    <span className="text-xl md:text-2xl font-medium">{key.number}</span>
                  </div>
                )}

                {/* Arrow indicator on Bottom for 8 */}
                {KeyIcon && key.number === "8" && (
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-xl md:text-2xl font-medium">{key.number}</span>
                    <KeyIcon className="h-4 w-4 opacity-70 mt-0.5" />
                  </div>
                )}

                {/* Standard render for 2 and 8 are handled above, others here */}
                {key.number !== "2" && key.number !== "8" && (
                  <span className="text-xl md:text-2xl font-medium">{key.number}</span>
                )}

                {/* Arrow indicator on Right side for 6, and bottom/other elements */}
                {KeyIcon && (key.number === "6" || key.number === "5") && (
                  <KeyIcon className={`h-4 w-4 opacity-70 ${key.number === "5" ? "h-2 w-2" : ""}`} />
                )}
              </div>

              {/* Text letters / labels */}
              {key.letters && (
                <div className="text-[9px] md:text-xs font-bold tracking-widest mt-0.5 opacity-60">
                  {key.letters}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const LAUNCHER_NUMBER_KEYS = [
  { number: "1", letters: "◡◡" },
  { number: "2", letters: "ABC" },
  { number: "3", letters: "DEF" },
  { number: "4", letters: "GHI" },
  { number: "5", letters: "JKL" },
  { number: "6", letters: "MNO" },
  { number: "7", letters: "PQRS" },
  { number: "8", letters: "TUV" },
  { number: "9", letters: "WXYZ" },
  { number: "*", letters: "+" },
  { number: "0", letters: "▔" },
  { number: "#", letters: "▧" },
];

const HandsetLegend = ({ end = false }) => (
  <svg viewBox="0 0 70 38" aria-hidden="true" className="physical-handset">
    <path d="M6 22v-5C6 7 17 5 25 5h20c9 0 19 3 19 12v5" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
    {end && <><circle cx="35" cy="25" r="9" fill="none" stroke="currentColor" strokeWidth="3"/><path d="M35 20v10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></>}
  </svg>
);

const LauncherKeypad = memo(({ onPress }) => {
  const longPressTimersRef = useRef(new Map());
  const longPressFiredRef = useRef(new Map());
  const recentPointerRef = useRef(new Map());

  const clearAllLongPress = useCallback(() => {
    longPressTimersRef.current.forEach((timer) => clearTimeout(timer));
    longPressTimersRef.current.clear();
  }, []);

  useEffect(() => clearAllLongPress, [clearAllLongPress]);

  const handlePointerDownKey = useCallback((key) => {
    recentPointerRef.current.set(key, Date.now());
    onPress(key);
  }, [onPress]);

  const handleClickKey = useCallback((key) => {
    const lastTime = recentPointerRef.current.get(key) || 0;
    if (Date.now() - lastTime < 450) {
      return;
    }
    onPress(key);
  }, [onPress]);

  const startLongPress = useCallback((key, longKey) => {
    if (longPressTimersRef.current.has(key)) {
      clearTimeout(longPressTimersRef.current.get(key));
    }
    longPressFiredRef.current.set(key, false);
    const timer = setTimeout(() => {
      longPressFiredRef.current.set(key, true);
      longPressTimersRef.current.delete(key);
      onPress(longKey);
    }, 360);
    longPressTimersRef.current.set(key, timer);
  }, [onPress]);

  const finishLongPress = useCallback((key, shortKey) => {
    if (longPressTimersRef.current.has(key)) {
      clearTimeout(longPressTimersRef.current.get(key));
      longPressTimersRef.current.delete(key);
      if (!longPressFiredRef.current.get(key)) {
        recentPointerRef.current.set(key, Date.now());
        onPress(shortKey);
      }
    }
  }, [onPress]);

  const cancelLongPress = useCallback((key) => {
    if (longPressTimersRef.current.has(key)) {
      clearTimeout(longPressTimersRef.current.get(key));
      longPressTimersRef.current.delete(key);
    }
  }, []);

  const handleClickLongPress = useCallback((key, shortKey) => {
    if (longPressFiredRef.current.get(key)) {
      longPressFiredRef.current.set(key, false);
      return;
    }
    const lastTime = recentPointerRef.current.get(key) || 0;
    if (Date.now() - lastTime < 450) {
      return;
    }
    onPress(shortKey);
  }, [onPress]);

  return (
    <div className="physical-keypad" data-testid="keypad" onContextMenu={(e) => e.preventDefault()}>
      <div className="physical-controls">
        <button
          type="button"
          className="physical-key physical-soft-left"
          onPointerDown={() => handlePointerDownKey("SOFT_LEFT")}
          onClick={() => handleClickKey("SOFT_LEFT")}
          aria-label="Go to or Delete"
        >
          <span className="physical-key__face">
            <svg viewBox="0 0 70 38" aria-hidden="true">
              <path d="M7 19h56" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </span>
        </button>

        <button
          type="button"
          className="physical-key physical-soft-right"
          onPointerDown={() => handlePointerDownKey("SOFT_RIGHT")}
          onClick={() => handleClickKey("SOFT_RIGHT")}
          aria-label="Settings or Back"
        >
          <span className="physical-key__face">
            <svg viewBox="0 0 70 38" aria-hidden="true">
              <path d="M7 19h56" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </span>
        </button>

        <button
          type="button"
          className="physical-key physical-call"
          data-testid="keypad-btn-tab"
          onPointerDown={() => handlePointerDownKey("GREEN")}
          onClick={() => handleClickKey("GREEN")}
          aria-label="Call or Tab"
        >
          <span className="physical-key__face">
            <HandsetLegend />
          </span>
        </button>

        <div className="physical-dpad" role="group" aria-label="Directional pad">
          <div className="physical-dpad__rocker" aria-hidden="true">
            <div className="physical-dpad__rim">
              <div className="physical-dpad__cap" />
            </div>
          </div>
          <button
            type="button"
            className="physical-dpad__hit physical-dpad__hit--up"
            onPointerDown={() => handlePointerDownKey("UP")}
            onClick={() => handleClickKey("UP")}
            aria-label="Up"
          />
          <button
            type="button"
            className="physical-dpad__hit physical-dpad__hit--left"
            onPointerDown={() => handlePointerDownKey("LEFT")}
            onClick={() => handleClickKey("LEFT")}
            aria-label="Left"
          />
          <button
            type="button"
            className="physical-dpad__hit physical-dpad__hit--select"
            data-testid="keypad-btn-select"
            onPointerDown={() => handlePointerDownKey("SELECT")}
            onClick={() => handleClickKey("SELECT")}
            aria-label="Select"
          />
          <button
            type="button"
            className="physical-dpad__hit physical-dpad__hit--right"
            onPointerDown={() => handlePointerDownKey("RIGHT")}
            onClick={() => handleClickKey("RIGHT")}
            aria-label="Right"
          />
          <button
            type="button"
            className="physical-dpad__hit physical-dpad__hit--down"
            onPointerDown={() => handlePointerDownKey("DOWN")}
            onClick={() => handleClickKey("DOWN")}
            aria-label="Down"
          />
        </div>

        <button
          type="button"
          className="physical-key physical-end"
          data-testid="keypad-btn-end"
          onClick={() => handleClickLongPress("END", "END")}
          onPointerDown={() => startLongPress("END", "LOCK_SCREEN")}
          onPointerUp={() => finishLongPress("END", "END")}
          onPointerCancel={() => cancelLongPress("END")}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Home"
        >
          <span className="physical-key__face">
            <HandsetLegend end />
          </span>
        </button>
      </div>

      <div className="physical-numbers">
        {LAUNCHER_NUMBER_KEYS.map((key) => {
          const isZero = key.number === "0";
          const isHash = key.number === "#";
          const isLongPress = isZero || isHash;
          const longKey = isZero ? "FLASHLIGHT" : "NOTIFICATION_MODE";
          const shortKey = isZero ? "0" : "HASH";

          return (
            <button
              type="button"
              key={key.number}
              data-testid={`keypad-btn-${key.number === "*" ? "star" : isHash ? "hash" : key.number}`}
              className="physical-key physical-number"
              onClick={isLongPress ? () => handleClickLongPress(key.number, shortKey) : () => handleClickKey(key.number)}
              onPointerDown={isLongPress ? () => startLongPress(key.number, longKey) : () => handlePointerDownKey(key.number)}
              onPointerUp={isLongPress ? () => finishLongPress(key.number, shortKey) : undefined}
              onPointerCancel={isLongPress ? () => cancelLongPress(key.number) : undefined}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={key.number}
            >
              <span className="physical-key__face">
                <strong>
                  {key.number === "*" ? (
                    <svg className="physical-star" viewBox="0 0 40 44" aria-hidden="true">
                      <path d="M20 2v40M3 11l34 22M3 33L37 11" fill="none" stroke="currentColor" strokeWidth="4" />
                    </svg>
                  ) : (
                    key.number
                  )}
                </strong>
                {key.number === "0" ? (
                  <span className="physical-accessory"><Globe2 /></span>
                ) : isHash ? (
                  <span className="physical-accessory"><House /><Music2 /></span>
                ) : (
                  <small>{key.letters.toLowerCase()}</small>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

export default memo(Keypad);
