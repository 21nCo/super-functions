export function getToolbarAnchors(document) {
  return document.querySelectorAll('[data-toolbar]');
}

export function getBrokenAnchors() {
  throw new Error('bad dom');
}
