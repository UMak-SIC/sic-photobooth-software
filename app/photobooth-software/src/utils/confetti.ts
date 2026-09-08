import confetti from 'canvas-confetti';

export interface ConfettiOptions {
  particleCount?: number;
  spread?: number;
  origin?: { x?: number; y?: number };
  colors?: string[];
  durationMs?: number;
}

const SIC_CONFETTI_COLORS = [
  '#058d51', // SIC green
  '#10b981', // Emerald
  '#1b6b55', // Deep brand green
  '#f59e0b', // Amber gold
  '#fbbf24', // Light gold
  '#ffffff', // Crisp white
  '#06b6d4', // Cyan accent
];

let activeCanvas: HTMLCanvasElement | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeInstance: any = null;

function injectConfettiStyles(): void {
  if (typeof document === 'undefined' || document.getElementById('sic-confetti-styles')) return;
  const style = document.createElement('style');
  style.id = 'sic-confetti-styles';
  style.textContent = `
    @keyframes sic-confetti-fall-0 {
      0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
      100% { transform: translateY(105vh) translateX(60px) rotate(540deg) scale(0.9); opacity: 0; }
    }
    @keyframes sic-confetti-fall-1 {
      0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
      100% { transform: translateY(105vh) translateX(-60px) rotate(-540deg) scale(0.9); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Spawns a subtle, tasteful set of DOM-based fluttering confetti ribbons.
 */
function spawnDomConfetti(): void {
  if (typeof document === 'undefined') return;
  injectConfettiStyles();

  const container = document.createElement('div');
  container.id = 'sic-dom-confetti-container';
  container.style.position = 'fixed';
  container.style.inset = '0';
  container.style.width = '100vw';
  container.style.height = '100vh';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '2147483646';
  container.style.overflow = 'hidden';
  document.body.appendChild(container);

  const particleCount = 24;

  for (let i = 0; i < particleCount; i++) {
    const el = document.createElement('div');
    const color = SIC_CONFETTI_COLORS[Math.floor(Math.random() * SIC_CONFETTI_COLORS.length)];
    const size = Math.floor(Math.random() * 5) + 7; // 7px to 12px
    const isCircle = Math.random() > 0.5;

    const startX = Math.random() * 100;
    const duration = 2.2 + Math.random() * 1.6;
    const delay = Math.random() * 0.3;

    el.style.position = 'absolute';
    el.style.left = `${startX}vw`;
    el.style.top = '-15px';
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.backgroundColor = color;
    el.style.borderRadius = isCircle ? '50%' : '2px';
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.12)';
    el.style.transform = `rotate(${Math.random() * 360}deg)`;
    el.style.animation = `sic-confetti-fall-${i % 2} ${duration}s ease-out ${delay}s forwards`;

    container.appendChild(el);
  }

  setTimeout(() => {
    container.remove();
  }, 4500);
}

/**
 * Checks if HTMLCanvasElement and 2d context are genuinely supported.
 */
export function isCanvasSupported(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext && canvas.getContext('2d'));
  } catch {
    return false;
  }
}

/**
 * Creates or retrieves the dedicated top-level canvas instance.
 * Forced useWorker: false guarantees immediate, reliable 2D canvas GPU rendering.
 */
function getCanvasConfettiLauncher() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (!isCanvasSupported()) return null;

  try {
    if (!activeCanvas || !document.body.contains(activeCanvas)) {
      activeCanvas = document.createElement('canvas');
      activeCanvas.id = 'sic-photobooth-celebration-canvas';
      activeCanvas.style.position = 'fixed';
      activeCanvas.style.top = '0px';
      activeCanvas.style.left = '0px';
      activeCanvas.style.width = '100vw';
      activeCanvas.style.height = '100vh';
      activeCanvas.style.pointerEvents = 'none';
      activeCanvas.style.zIndex = '2147483647';
      activeCanvas.width = window.innerWidth;
      activeCanvas.height = window.innerHeight;
      document.body.appendChild(activeCanvas);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createFn = (confetti as any).create || confetti;
      if (typeof createFn === 'function') {
        activeInstance = createFn(activeCanvas, {
          resize: true,
          useWorker: false,
        });
      }
    }
    return activeInstance || confetti;
  } catch (err) {
    console.warn('Canvas creation failed, falling back:', err);
    return null;
  }
}

/**
 * Fires a tasteful, slightly reduced celebratory confetti burst.
 */
export function fireCelebrationConfetti(options?: ConfettiOptions): void {
  try {
    // 1. Subtle DOM fluttering confetti
    spawnDomConfetti();

    // 2. Crisp Canvas Confetti
    const launcher = getCanvasConfettiLauncher();
    const colors = options?.colors || SIC_CONFETTI_COLORS;

    if (launcher && typeof launcher === 'function') {
      // Left Cannon
      launcher({
        particleCount: options?.particleCount ? Math.floor(options.particleCount / 2) : 45,
        angle: 60,
        spread: options?.spread ?? 65,
        startVelocity: 45,
        origin: options?.origin ?? { x: 0, y: 0.8 },
        colors,
        zIndex: 2147483647,
        disableForReducedMotion: false,
      });

      // Right Cannon
      launcher({
        particleCount: options?.particleCount ? Math.floor(options.particleCount / 2) : 45,
        angle: 120,
        spread: options?.spread ?? 65,
        startVelocity: 45,
        origin: options?.origin ?? { x: 1, y: 0.8 },
        colors,
        zIndex: 2147483647,
        disableForReducedMotion: false,
      });

      // Center celebratory burst at 180ms
      setTimeout(() => {
        try {
          launcher({
            particleCount: options?.particleCount ?? 55,
            spread: 90,
            startVelocity: 38,
            origin: { x: 0.5, y: 0.5 },
            colors,
            zIndex: 2147483647,
            disableForReducedMotion: false,
          });
        } catch {
          // ignore
        }
      }, 180);
    }
  } catch (err) {
    console.warn('Confetti launch error:', err);
  }
}

// Attach globally for easy manual testing / debug triggers
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).fireCelebrationConfetti = fireCelebrationConfetti;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).runConfetti = fireCelebrationConfetti;

  // Auto-bind to any element with id "hs-run-on-click-run-confetti"
  window.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.id === 'hs-run-on-click-run-confetti' || target.closest('#hs-run-on-click-run-confetti'))) {
      fireCelebrationConfetti();
    }
  });
}
