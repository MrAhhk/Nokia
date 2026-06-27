import { memo, useState } from "react";

const Keypad = ({ onKeypadPress }) => {
  const [activeKey, setActiveKey] = useState(null);

  const keys = [
    { number: "1", letters: "", testId: "keypad-btn-1" },
    { number: "2", letters: "ABC", testId: "keypad-btn-2" },
    { number: "3", letters: "DEF", testId: "keypad-btn-3" },
    { number: "4", letters: "GHI", testId: "keypad-btn-4" },
    { number: "5", letters: "JKL", testId: "keypad-btn-5" },
    { number: "6", letters: "MNO", testId: "keypad-btn-6" },
    { number: "7", letters: "PQRS", testId: "keypad-btn-7" },
    { number: "8", letters: "TUV", testId: "keypad-btn-8" },
    { number: "9", letters: "WXYZ", testId: "keypad-btn-9" },
    { number: "*", letters: "+", testId: "keypad-btn-star" },
    { number: "0", letters: "_", testId: "keypad-btn-0" },
    { number: "#", letters: "", testId: "keypad-btn-hash" },
  ];

  const handleKeyPress = (key) => {
    setActiveKey(key.number);
    onKeypadPress(key.number);
    setTimeout(() => setActiveKey(null), 75);
  };

  return (
    <div className="grid grid-cols-3 grid-rows-4 gap-3 md:gap-4 h-full w-full max-w-[400px]" data-testid="keypad">
      {keys.map((key) => (
        <button
          key={key.number}
          data-testid={key.testId}
          onClick={() => handleKeyPress(key)}
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
          <div className="text-2xl md:text-3xl font-medium">{key.number}</div>
          {key.letters && (
            <div className="text-[9px] md:text-xs font-bold tracking-widest mt-1 opacity-60">
              {key.letters}
            </div>
          )}
        </button>
      ))}
    </div>
  );
};

export default memo(Keypad);
