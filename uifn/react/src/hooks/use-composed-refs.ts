import * as React from 'react';

type PossibleRef<T> = React.Ref<T> | undefined;

function setRef<T>(ref: PossibleRef<T>, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref !== null && ref !== undefined) {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

export function useComposedRefs<T>(...refs: PossibleRef<T>[]) {
  const refsRef = React.useRef(refs);

  React.useEffect(() => {
    refsRef.current = refs;
  });

  return React.useCallback((node: T | null) => {
    refsRef.current.forEach((ref) => setRef(ref, node));
  }, []);
}
