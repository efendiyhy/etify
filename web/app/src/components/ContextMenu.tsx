import { ExternalLink, Link2, Play } from 'lucide-react';
import { useCallback, useEffect, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { create } from 'zustand';
import { Menu, MenuItem, MenuSeparator } from '@/components/Menu';
import { TrackMenuItems } from '@/components/music/TrackMenu';
import type { Track } from '@/data/music/types';
import { useT } from '@/lib/i18n';

/**
 * Right-click menus: the browser's own menu is replaced across the app, and
 * songs, albums, playlists and artists open the app's menu where the pointer is.
 * The browser's menu still opens in text fields, on selected text, and with
 * Shift held.
 */

type Target = { kind: 'track'; track: Track } | { kind: 'link'; title: string; href: string; onPlay?: () => void };

interface ContextMenuState {
  open: { x: number; y: number; target: Target } | null;
  show: (x: number, y: number, target: Target) => void;
  close: () => void;
}

const useContextMenu = create<ContextMenuState>()((set) => ({
  open: null,
  show: (x, y, target) => set({ open: { x, y, target } }),
  close: () => set({ open: null }),
}));

/** Whether this right-click should keep the browser's own menu. */
function wantsNativeMenu(event: { shiftKey: boolean; target: EventTarget | null }): boolean {
  if (event.shiftKey) return true;
  const el = event.target instanceof Element ? event.target : null;
  if (el?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
  const selection = window.getSelection();
  return !!selection && !selection.isCollapsed && selection.toString().trim().length > 0;
}

/** An onContextMenu handler opening a track's menu. */
export function trackContextMenu(track: Track) {
  return (event: MouseEvent) => {
    if (wantsNativeMenu(event)) return;
    event.preventDefault();
    event.stopPropagation();
    useContextMenu.getState().show(event.clientX, event.clientY, { kind: 'track', track });
  };
}

/** An onContextMenu handler opening an album, playlist or artist's menu. */
export function linkContextMenu(title: string, href: string, onPlay?: () => void) {
  return (event: MouseEvent) => {
    if (wantsNativeMenu(event)) return;
    event.preventDefault();
    event.stopPropagation();
    useContextMenu.getState().show(event.clientX, event.clientY, { kind: 'link', title, href, onPlay });
  };
}

function LinkItems({ title, href, onPlay, onClose }: { title: string; href: string; onPlay?: () => void; onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const url = new URL(href, window.location.origin).toString();
  return (
    <>
      {onPlay && (
        <MenuItem icon={<Play size={15} />} onSelect={() => (onClose(), onPlay())}>
          Play
        </MenuItem>
      )}
      <MenuItem icon={<ExternalLink size={15} />} onSelect={() => (onClose(), void navigate(href))}>
        {t('ctx.open')}
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={<Link2 size={15} />}
        onSelect={() => {
          onClose();
          void navigator.clipboard?.writeText(url);
        }}
      >
        {t('ctx.copyLink')}
      </MenuItem>
      <span className="sr-only">{title}</span>
    </>
  );
}

/** Mounted once in the shell: blocks the browser's menu and draws the app's. */
export function ContextMenuHost(): ReactNode {
  const open = useContextMenu((s) => s.open);
  const close = useContextMenu((s) => s.close);
  const onClose = useCallback(() => close(), [close]);

  useEffect(() => {
    const onContextMenu = (event: globalThis.MouseEvent) => {
      if (!wantsNativeMenu(event)) event.preventDefault();
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, []);

  if (!open) return null;
  const { target } = open;
  return (
    <Menu
      // Re-mounts per right-click, so a second one moves the menu.
      key={`${open.x},${open.y}`}
      anchor={document.body}
      point={open}
      onClose={onClose}
      label={target.kind === 'track' ? target.track.title : target.title}
    >
      {target.kind === 'track' ? (
        <TrackMenuItems track={target.track} onClose={onClose} />
      ) : (
        <LinkItems title={target.title} href={target.href} onPlay={target.onPlay} onClose={onClose} />
      )}
    </Menu>
  );
}
