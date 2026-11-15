import type { I18nKey } from './i18n';

/** "Good morning" and so on, by the clock on this computer: the key to translate. */
export function greetingKey(now = new Date()): I18nKey {
  const hour = now.getHours();
  if (hour < 5) return 'greeting.night';
  if (hour < 11) return 'greeting.morning';
  if (hour < 15) return 'greeting.afternoon';
  // Indonesian splits the afternoon: "siang" until three, then "sore".
  if (hour < 18) return 'greeting.lateAfternoon';
  return 'greeting.evening';
}
