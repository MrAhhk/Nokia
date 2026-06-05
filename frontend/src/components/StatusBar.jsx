import { Battery, Signal, Wifi } from "lucide-react";

const StatusBar = ({ currentTime }) => {
  const formatTime = (date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  };

  return (
    <div
      className="flex justify-between items-center pb-2 border-b border-white/20 text-xs md:text-sm font-mono opacity-80"
      data-testid="status-bar"
    >
      <div className="flex items-center gap-2">
        <Signal size={14} data-testid="status-signal" />
        <Wifi size={14} data-testid="status-wifi" />
        <Battery size={14} data-testid="status-battery" />
      </div>
      <div className="flex items-center gap-3">
        <span data-testid="status-time">{formatTime(currentTime)}</span>
        <span data-testid="status-date">{formatDate(currentTime)}</span>
      </div>
    </div>
  );
};

export default StatusBar;