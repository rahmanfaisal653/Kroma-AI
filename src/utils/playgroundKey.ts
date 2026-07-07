const PLAYGROUND_KEY_PREFIX = 'playground_user_key';

const userScope = (userId?: string | number) =>
  userId !== undefined && userId !== null ? `uid_${userId}` : 'guest';

export const getPlaygroundKeyStorageKey = (userId?: string | number) =>
  `${PLAYGROUND_KEY_PREFIX}:${userScope(userId)}`;

export const loadPlaygroundUserKey = (
  userId?: string | number,
  legacyKeys: string[] = []
): string => {
  const scoped = localStorage.getItem(getPlaygroundKeyStorageKey(userId));
  if (scoped) return scoped;
  for (const key of legacyKeys) {
    const val = localStorage.getItem(key);
    if (val) return val;
  }
  return '';
};

export const savePlaygroundUserKey = (value: string, userId?: string | number) => {
  localStorage.setItem(getPlaygroundKeyStorageKey(userId), value);
};
