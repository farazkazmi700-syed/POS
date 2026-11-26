import { useEffect, useState } from 'react';

export function useRecoveryCooldown() {
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!retryAt) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0) setRetryAt(0);
    };
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  function startCooldown(delay: number) {
    setSeconds(delay);
    setRetryAt(Date.now() + delay * 1000);
  }

  return { seconds, startCooldown };
}
