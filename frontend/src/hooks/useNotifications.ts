import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi } from '@/services/endpoints';
import type { AppNotification } from '@/types';

const MAX_VISIBLE = 40;
const MIN_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 30000;

function streamUrl(lastId: number): string {
  const base = import.meta.env.VITE_API_BASE_URL || '/api';
  const root = base.replace(/\/$/, '');
  const qs = lastId > 0 ? `?last_id=${lastId}` : '';
  return `${root}/notifications/stream/${qs}`;
}

/**
 * One EventSource per browser tab. React Strict Mode remounts and HMR used to
 * open overlapping streams and trip the server's too_many_streams cap.
 */
type StreamHandlers = {
  onConnected: () => void;
  onDisconnected: () => void;
  onNotification: (payload: AppNotification) => void;
  getLastId: () => number;
  setLastId: (id: number) => void;
};

let sharedSource: EventSource | null = null;
let sharedHandlers: StreamHandlers | null = null;
let sharedBackoff = MIN_BACKOFF_MS;
let sharedReconnectTimer: number | null = null;
let sharedSubscriberCount = 0;

function clearSharedReconnect() {
  if (sharedReconnectTimer != null) {
    window.clearTimeout(sharedReconnectTimer);
    sharedReconnectTimer = null;
  }
}

function closeSharedSource() {
  sharedSource?.close();
  sharedSource = null;
}

function scheduleSharedReconnect() {
  if (!sharedHandlers || sharedSubscriberCount <= 0) return;
  clearSharedReconnect();
  const delay = sharedBackoff;
  sharedBackoff = Math.min(MAX_BACKOFF_MS, Math.round(sharedBackoff * 1.7));
  sharedReconnectTimer = window.setTimeout(() => {
    sharedReconnectTimer = null;
    openSharedSource();
  }, delay);
}

function openSharedSource() {
  if (!sharedHandlers || sharedSubscriberCount <= 0) return;
  closeSharedSource();
  const source = new EventSource(streamUrl(sharedHandlers.getLastId()), { withCredentials: true });
  sharedSource = source;

  source.addEventListener('connected', () => {
    sharedBackoff = MIN_BACKOFF_MS;
    sharedHandlers?.onConnected();
  });
  source.addEventListener('ping', () => sharedHandlers?.onConnected());
  source.addEventListener('notification', (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as AppNotification;
      sharedHandlers?.onNotification(payload);
      sharedHandlers?.setLastId(Math.max(sharedHandlers.getLastId(), payload.id));
    } catch {
      // Ignore malformed frames.
    }
  });
  source.addEventListener('reconnect', () => {
    source.close();
    if (sharedSource === source) sharedSource = null;
    sharedHandlers?.onDisconnected();
    // Server ended a healthy stream — reconnect soon, but not instantly.
    sharedBackoff = Math.max(sharedBackoff, 800);
    scheduleSharedReconnect();
  });
  source.addEventListener('error', (event) => {
    try {
      const detail = JSON.parse((event as MessageEvent).data || '{}') as { detail?: string };
      if (detail.detail === 'too_many_streams') {
        sharedBackoff = Math.max(sharedBackoff, 8000);
      }
    } catch {
      // Browser may fire a generic error with no body (e.g. 503).
      sharedBackoff = Math.max(sharedBackoff, 5000);
    }
  });
  source.onerror = () => {
    sharedHandlers?.onDisconnected();
    source.close();
    if (sharedSource === source) sharedSource = null;
    scheduleSharedReconnect();
  };
}

function subscribeSharedStream(handlers: StreamHandlers) {
  sharedHandlers = handlers;
  sharedSubscriberCount += 1;
  if (!sharedSource && sharedReconnectTimer == null) {
    openSharedSource();
  }
  return () => {
    sharedSubscriberCount = Math.max(0, sharedSubscriberCount - 1);
    if (sharedSubscriberCount === 0) {
      clearSharedReconnect();
      closeSharedSource();
      sharedHandlers = null;
      sharedBackoff = MIN_BACKOFF_MS;
    }
  };
}

export function useNotifications(enabled: boolean) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const lastIdRef = useRef(0);

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

  useEffect(() => {
    if (!enabled) return;
    let unsubscribe: (() => void) | undefined;
    void loadInitial().then(() => {
      unsubscribe = subscribeSharedStream({
        onConnected: () => setConnected(true),
        onDisconnected: () => setConnected(false),
        getLastId: () => lastIdRef.current,
        setLastId: (id) => {
          lastIdRef.current = id;
        },
        onNotification: (payload) => {
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
        },
      });
    });
    return () => {
      unsubscribe?.();
      setConnected(false);
    };
  }, [enabled, loadInitial]);

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
