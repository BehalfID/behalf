const patterns = {
  light: [8],
  medium: [15],
  heavy: [25],
  success: [10, 60, 20],
  error: [20, 40, 20, 40, 40],
} as const;

type HapticPattern = keyof typeof patterns;

export function haptic(pattern: HapticPattern = "light") {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(patterns[pattern]);
  }
}
