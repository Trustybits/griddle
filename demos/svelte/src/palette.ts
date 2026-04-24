const palette: Record<string, string> = {};
const hues = [210, 340, 135, 35, 270, 190, 20, 285, 90, 0, 170, 55];

export function colorForSize(w: number, h: number): string {
  const key = `${w}x${h}`;
  if (palette[key]) return palette[key]!;
  const hash = (w * 73856093) ^ (h * 19349663);
  const hue = hues[Math.abs(hash) % hues.length]!;
  const sat = 65 + ((w + h) % 3) * 8;
  const light = 55 + ((w * h) % 4) * 4;
  const c = `hsl(${hue} ${sat}% ${light}%)`;
  palette[key] = c;
  return c;
}
