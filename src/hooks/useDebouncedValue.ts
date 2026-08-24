import { useEffect, useState } from 'react';

/**
 * The value, but only after it has stopped changing for `delay` ms.
 *
 * Every search box in this app queries the server, so without this a request goes out
 * per keystroke — against a usage sheet or a log file that may be tens of megabytes.
 */
export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (value === debounced) return undefined;
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, debounced, delay]);

  return debounced;
}
