/**
 * Where is this visitor, for "Add to home screen"? Pure so it can be tested with any user agent.
 *  - installed: already running from the home screen.
 *  - in-app: inside Instagram, Facebook, TikTok, Pinterest or LinkedIn's browser, which can't
 *    install web apps (checked first, because those browsers also look like iOS or Android).
 *  - ios: iPhone or iPad (iPadOS can report itself as a Mac with touch), in any browser.
 *  - android: an Android browser offered an install prompt (we caught `beforeinstallprompt`).
 *    Desktop Chrome offers one too, but the sheet is for phones only.
 *  - unsupported: desktop, or anything else. The sheet never shows.
 */
export type InstallSituation = 'android' | 'ios' | 'in-app' | 'installed' | 'unsupported';

export interface DetectInput {
  ua: string;
  standalone: boolean;
  maxTouchPoints: number;
  hasInstallPrompt: boolean;
}

const IN_APP: Array<[RegExp, string]> = [
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB/i, 'Facebook'],
  [/TikTok|musical_ly|BytedanceWebview/i, 'TikTok'],
  [/Pinterest/i, 'Pinterest'],
  [/LinkedInApp/i, 'LinkedIn'],
];

/** "Instagram", "Facebook"…, or null if not a known in-app browser. */
export function inAppName(ua: string): string | null {
  return IN_APP.find(([re]) => re.test(ua))?.[1] ?? null;
}

export function isIos(ua: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
}

/** iOS Chrome keeps Share at the top right; Safari (and most others) in the bottom bar. */
export function iosShareAt(ua: string): 'bottom' | 'top-right' {
  return /CriOS/i.test(ua) ? 'top-right' : 'bottom';
}

export function detectInstall(i: DetectInput): InstallSituation {
  if (i.standalone) return 'installed';
  if (inAppName(i.ua)) return 'in-app';
  if (isIos(i.ua, i.maxTouchPoints)) return 'ios';
  if (i.hasInstallPrompt && /Android/i.test(i.ua)) return 'android';
  return 'unsupported';
}

/** Reads the real browser (client only). */
export function detectHere(hasInstallPrompt: boolean): InstallSituation {
  const nav = navigator as Navigator & { standalone?: boolean };
  let standalone = nav.standalone === true;
  try {
    standalone ||= window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    // Old browsers: not standalone.
  }
  return detectInstall({
    ua: navigator.userAgent,
    standalone,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    hasInstallPrompt,
  });
}
