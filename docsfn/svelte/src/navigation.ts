interface NavigationPage {
  path: string;
}

export function navigateTo(path: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.location.href = path;
}

export function handlePaginationShortcut(input: {
  event: KeyboardEvent;
  prevPage?: NavigationPage;
  nextPage?: NavigationPage;
  navigate?: (path: string) => void;
}): boolean {
  const navigate = input.navigate ?? navigateTo;
  const target = input.event.target;
  if (input.event.defaultPrevented || input.event.isComposing || (typeof Element !== "undefined" && target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))) return false;

  if (input.event.altKey && input.event.key === "ArrowLeft" && input.prevPage) {
    input.event.preventDefault();
    navigate(input.prevPage.path);
    return true;
  }

  if (input.event.altKey && input.event.key === "ArrowRight" && input.nextPage) {
    input.event.preventDefault();
    navigate(input.nextPage.path);
    return true;
  }

  return false;
}
