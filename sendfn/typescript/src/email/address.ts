export function isBareEmail(value: string): boolean {
  if (!value) return false;

  let atIndex = -1;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character.trim() === '' || character === '<' || character === '>') return false;
    if (character === '@') {
      if (atIndex !== -1) return false;
      atIndex = index;
    }
  }

  if (atIndex <= 0 || atIndex >= value.length - 1) return false;
  const dotIndex = value.indexOf('.', atIndex + 1);
  return dotIndex > atIndex + 1 && dotIndex < value.length - 1;
}
