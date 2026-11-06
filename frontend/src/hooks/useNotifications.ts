import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi } from '@/services/endpoints';
import type { AppNotification } from '@/types';

const MAX_VISIBLE = 40;

function streamUrl(lastId: number): string {
  const base = import.meta.env.VITE_API_BASE_URL || '/api';
  const root = base.replace(/\/$/, '');
  const qs = lastId > 0 ? `?last_id=${lastId}` : '';
  return `${root}/notifications/stream/${qs}`;
}

export function useNotifications(enabled: boolean) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const lastIdRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  const upsert = useCallback((notification: AppNotification) => {
    setItems((prev) => {
      const without = prev.filter((item) => item.id !== notification.id);
      return [notification, ...without].slice(0, MAX_VISIBLE);
    });
    lastIdRef.current = Math.max(lastIdRef.current, notification.id);
    if (!notification.read_at) {
      setUnreadCount((count) => Math.max(count, 0) + 1);
    }
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await notificationsApi.list({ page: 1, page_size: 20 });
      setItems(data.results);
      setUnreadCount(data.unread_count);
      lastIdRef.current = data.results.reduce((max, row) => Math.max(max, row.id), 0);
    } catch {
      setItems([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled) return;
    esRef.current?.close();
    const source = new EventSource(streamUrl(lastIdRef.current), { withCredentials: true });
    esRef.current = source;

    source.addEventListener('connected', () => setConnected(true));
    source.addEventListener('ping', () => setConnected(true));
    source.addEventListener('notification', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as AppNotification;
        setItems((prev) => {
          const existing = prev.find((item) => item.id === payload.id);
          const without = prev.filter((item) => item.id !== payload.id);
          const next = [payload, ...without].slice(0, MAX_VISIBLE);
          if (!existing && !payload.read_at) {
            setUnreadCount((count) => count + 1);
          } else if (existing && existing.read_at && !payload.read_at) {
            setUnreadCount((count) => count + 1);
          } else if (existing && !existing.read_at && payload.read_at) {
            setUnreadCount((count) => Math.max(0, count - 1));
          }
          return next;
        });
        lastIdRef.current = Math.max(lastIdRef.current, payload.id);
      } catch {
        // Ignore malformed frames.
      }
    });
    source.addEventListener('reconnect', () => {
      source.close();
      setConnected(false);
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = window.setTimeout(connect, 250);
    });
    source.onerror = () => {
      setConnected(false);
      source.close();
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      // Back off briefly so a 503 (too many streams) does not stampede.
      reconnectTimer.current = window.setTimeout(connect, 4000);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void loadInitial().then(connect);
    return () => {
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [enabled, connect, loadInitial]);

  const markRead = useCallback(async (ids: number[]) => {
    if (!ids.length) return;
    const unreadIds = items.filter((item) => ids.includes(item.id) && !item.read_at).map((item) => item.id);
    if (!unreadIds.length) return;
    await notificationsApi.markRead(unreadIds);
    setItems((prev) =>
      prev.map((item) =>
        unreadIds.includes(item.id) ? { ...item, read_at: new Date().toISOString() } : item,
      ),
    );
    setUnreadCount((count) => Math.max(0, count - unreadIds.length));
  }, [items]);

  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    setItems((prev) =>
      prev.map((item) => (item.read_at ? item : { ...item, read_at: new Date().toISOString() })),
    );
    setUnreadCount(0);
  }, []);

  return {
    items,
    unreadCount,
    connected,
    loading,
    markRead,
    markAllRead,
    refresh: loadInitial,
    upsert,
  };
}
