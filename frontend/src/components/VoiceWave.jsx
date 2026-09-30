export function VoiceWave({ className = "", barClassName = "", bars = 4 }) {
  const delays = [0, 0.18, 0.36, 0.12, 0.28];
  const heights = ["h-2.5", "h-4", "h-3", "h-4.5", "h-2"];

  return (
    <span
      className={`inline-flex items-end gap-[2.5px] h-4 ${className}`}
      aria-hidden="true"
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={`voicebar w-[2.5px] ${heights[i % heights.length]} bg-current rounded-full ${barClassName}`}
          style={{
            animationDelay: `${delays[i % delays.length]}s`,
            animationDuration: `${0.75 + (i % 3) * 0.18}s`,
          }}
        />
      ))}
    </span>
  );
}

export default VoiceWave;
