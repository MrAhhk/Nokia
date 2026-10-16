export default function MiniscreenClock({ currentTime = new Date() }) {
  const value = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return <time className="miniscreen-clock" dateTime={currentTime.toISOString()} aria-label={`Current time ${value}`}>{value}</time>;
}
