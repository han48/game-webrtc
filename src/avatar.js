export const AVATAR_STORAGE_KEY = 'office.avatar';

export const DEFAULT_AVATAR = {
  skin: '#f0c7a3',
  shirt: '#f0c7a3',
  pants: '#44576b',
  hair: '#2d3748',
  eye: '#4b6f72',
  mouth: '#713f3b',
  hairstyle: 'short',
  accessory: 'none',
};

const COLOR_FIELDS = ['skin', 'shirt', 'pants', 'hair', 'eye', 'mouth'];
const HAIRSTYLES = ['short', 'spiky', 'long', 'bob', 'curly', 'ponytail', 'bald'];
const ACCESSORIES = ['none', 'glasses', 'cap', 'headphones', 'crown', 'bow'];

export function sanitizeAvatar(value) {
  const source = value && typeof value === 'object' ? value : {};
  const avatar = { ...DEFAULT_AVATAR };

  COLOR_FIELDS.forEach((field) => {
    if (typeof source[field] === 'string' && /^#[0-9a-f]{6}$/i.test(source[field])) {
      avatar[field] = source[field];
    }
  });
  if (HAIRSTYLES.includes(source.hairstyle)) avatar.hairstyle = source.hairstyle;
  if (ACCESSORIES.includes(source.accessory)) avatar.accessory = source.accessory;
  return avatar;
}

export function loadSavedAvatar() {
  try {
    return sanitizeAvatar(JSON.parse(localStorage.getItem(AVATAR_STORAGE_KEY) || '{}'));
  } catch {
    return { ...DEFAULT_AVATAR };
  }
}
