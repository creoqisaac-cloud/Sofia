/** Reloj inyectable: la vigencia comercial depende de "ahora", y las pruebas deben poder fijarlo. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string): Clock & { set(iso: string): void; advance(ms: number): void } {
  let current = new Date(iso);
  return {
    now: () => new Date(current),
    set: (next: string) => {
      current = new Date(next);
    },
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

export const DAY_MS = 24 * 60 * 60 * 1000;
