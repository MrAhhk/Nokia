import { memo, useState } from "react";
import { 
  Phone, 
  PhoneOff, 
  ChevronUp, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight, 
  Circle,
  Delete 
} from "lucide-react";

const Keypad = ({ onKeypadPress }) => {
  const [activeKey, setActiveKey] = useState(null);

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

  const handleKeyPress = (keyNumber) => {
    setActiveKey(keyNumber);
    onKeypadPress(keyNumber);
    setTimeout(() => setActiveKey(null), 75);
  };

  return (
    <div className="flex flex-col gap-3 md:gap-4 h-full w-full max-w-[400px]" data-testid="keypad">
      {/* Top Row: Nokia Control Keys */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {/* Green Call Button */}
        <button
          data-testid="keypad-btn-send"
          onClick={() => handleKeyPress("SEND")}
          className={`
            flex items-center justify-center h-12 md:h-14 rounded-md border 
            shadow-[0_4px_0_rgba(34,197,94,0.1)] active:translate-y-[4px] active:shadow-none 
            transition-all duration-75
            ${
              activeKey === "SEND"
                ? "bg-green-500 text-black border-green-500"
                : "border-green-500/20 bg-green-950/30 text-green-500"
            }
          `}
        >
          <Phone className="h-6 w-6" />
        </button>

        {/* Center Select Button */}
        <button
          data-testid="keypad-btn-select"
          onClick={() => handleKeyPress("SELECT")}
          className={`
            flex items-center justify-center h-12 md:h-14 rounded-md border 
            shadow-[0_4px_0_rgba(255,255,255,0.05)] active:translate-y-[4px] active:shadow-none 
            transition-all duration-75
            ${
              activeKey === "SELECT"
                ? "bg-white text-black border-white"
                : "border-white/10 bg-[#111] text-white"
            }
          `}
        >
          <span className="text-xs md:text-sm font-bold tracking-widest">SELECT</span>
        </button>

        {/* Red End Call Button */}
        <button
          data-testid="keypad-btn-end"
          onClick={() => handleKeyPress("END")}
          className={`
            flex items-center justify-center h-12 md:h-14 rounded-md border 
            shadow-[0_4px_0_rgba(239,68,68,0.1)] active:translate-y-[4px] active:shadow-none 
            transition-all duration-75
            ${
              activeKey === "END"
                ? "bg-red-500 text-black border-red-500"
                : "border-red-500/20 bg-red-950/30 text-red-500"
            }
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
              onClick={() => handleKeyPress(key.number)}
              className={`
                relative flex flex-col items-center justify-center rounded-md border border-white/10 
                shadow-[0_4px_0_rgba(255,255,255,0.05)] active:translate-y-[4px] active:shadow-none 
                transition-all duration-75
                ${
                  activeKey === key.number
                    ? "bg-white text-black"
                    : "bg-[#111] text-white"
                }
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

export default memo(Keypad);
