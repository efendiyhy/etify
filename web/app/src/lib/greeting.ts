import type { I18nKey } from './i18n';

/** "Good morning" and so on, by the clock on this computer: the key to translate. */
export function greetingKey(now = new Date()): I18nKey {
  const hour = now.getHours();
  if (hour < 5) return 'greeting.night';
  if (hour < 12) return 'greeting.morning';
  if (hour < 18) return 'greeting.afternoon';
  return 'greeting.evening';
}
