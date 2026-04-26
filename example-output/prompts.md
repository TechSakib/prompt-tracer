# AI Prompt History

> **Project:** `my-react-app`  
> **Total Prompts:** 5  
> **Sessions:** 2  
> **Last Updated:** 4/26/2025, 2:47:22 PM

---

## [4/26/2025, 2:47:22 PM]

| Field | Value |
|-------|-------|
| **ID** | `e5f6a7b8c9d0e1f2` |
| **Time** | 4/26/2025, 2:47:22 PM |
| **Active File** | `src/components/UserProfile.tsx` |
| **Language** | typescriptreact |
| **Method** | `command-intercept` |

### Prompt

```
Why is my UserProfile re-rendering 4 times on mount? The component uses useLocalStorage for theme preference. Check for infinite loop causes.
```

---

## [4/26/2025, 1:30:02 PM]

| Field | Value |
|-------|-------|
| **ID** | `d4e5f6a7b8c9d0e1` |
| **Time** | 4/26/2025, 1:30:02 PM |
| **Active File** | `src/components/UserProfile.tsx` |
| **Language** | typescriptreact |
| **Method** | `command-intercept` |

### Prompt

```
Refactor the UserProfile component to use the new useLocalStorage hook instead of the current useState + useEffect pattern.
```

---

## [4/26/2025, 9:05:47 AM]

| Field | Value |
|-------|-------|
| **ID** | `c3d4e5f6a7b8c9d0` |
| **Time** | 4/26/2025, 9:05:47 AM |
| **Active File** | `src/hooks/__tests__/useLocalStorage.test.ts` |
| **Language** | typescript |
| **Method** | `network-proxy` |

### Prompt

```
Write unit tests for useLocalStorage using React Testing Library and jest. Cover: initial value, update, SSR environment, corrupted JSON, and quota exceeded error.
```

---

## [4/26/2025, 8:24:11 AM]

| Field | Value |
|-------|-------|
| **ID** | `b2c3d4e5f6a7b8c9` |
| **Time** | 4/26/2025, 8:24:11 AM |
| **Active File** | `src/hooks/useLocalStorage.ts` |
| **Language** | typescript |
| **Method** | `command-intercept` |

### Prompt

```
Add error boundary support to the hook so it doesn't break the app if localStorage is full or unavailable.
```

---

## [4/26/2025, 8:12:03 AM]

| Field | Value |
|-------|-------|
| **ID** | `a1b2c3d4e5f6a7b8` |
| **Time** | 4/26/2025, 8:12:03 AM |
| **Active File** | `src/hooks/index.ts` |
| **Language** | typescript |
| **Method** | `command-intercept` |

### Prompt

```
Create a custom React hook called useLocalStorage that syncs state with localStorage, handles SSR safely, and supports JSON serialization.
```

### Response

```
Here's a production-ready useLocalStorage hook:

```typescript
import { useState, useEffect } from 'react';

function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch { return initialValue; }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) { console.error(error); }
  };

  return [storedValue, setValue] as const;
}

export default useLocalStorage;
```
```

---
