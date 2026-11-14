import { create } from 'zustand';

/**
 * The name the app uses for you: in Home's greeting, on the account button and
 * to others in Listen Together, in place of the Google account's name. Kept on
 * this browser only. Listen Together's older "Name in parties" carries over.
 */
const NICKNAME_KEY = 'etify:nickname';
export const NICKNAME_MAX = 40;

/** Listen Together's settings, where the name used to live (party/listenTogether.ts). */
const PARTY_SETTINGS_KEY = 'etify:party';

function readNickname(): string {
  try {
    const saved = localStorage.getItem(NICKNAME_KEY);
    if (saved !== null) return saved;
    const party = JSON.parse(localStorage.getItem(PARTY_SETTINGS_KEY) ?? '{}') as { nickname?: unknown };
    return typeof party.nickname === 'string' ? party.nickname.trim().slice(0, NICKNAME_MAX) : '';
  } catch {
    return '';
  }
}

interface ProfileState {
  nickname: string;
  setNickname: (nickname: string) => void;
}

export const useProfile = create<ProfileState>()((set) => ({
  nickname: readNickname(),
  setNickname: (value) => {
    const nickname = value.slice(0, NICKNAME_MAX);
    try {
      localStorage.setItem(NICKNAME_KEY, nickname);
    } catch {
      // Private windows can refuse storage; the name then lasts for this tab.
    }
    set({ nickname });
  },
}));

/** The nickname with its spaces trimmed, or empty when none is set. */
export function nickname(): string {
  return useProfile.getState().nickname.trim();
}

/** The trimmed nickname, for components. */
export function useNickname(): string {
  return useProfile((s) => s.nickname.trim());
}
