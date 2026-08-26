import { acquireUIFnDomPlatform, createUIFnPresence } from '@uifn/dom';
import React from 'react';

export interface PresenceProps {
  present: boolean;
  children: React.ReactElement | ((props: { present: boolean }) => React.ReactElement);
}

export const Presence: React.FC<PresenceProps> = ({ present, children }) => {
  const [mounted, setMounted] = React.useState(present);
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const presenceRef = React.useRef<ReturnType<typeof createUIFnPresence> | null>(null);

  React.useEffect(() => {
    if (!node) return;
    const lease = acquireUIFnDomPlatform({ root: node.ownerDocument });
    const presence = createUIFnPresence(lease.platform.scope, {
      element: node,
      present,
      onStateChange(state) {
        setMounted(state !== 'unmounted');
      },
    });
    presenceRef.current = presence;
    return () => {
      presenceRef.current = null;
      presence.destroy();
      lease.release();
    };
  }, [node]);

  React.useEffect(() => {
    presenceRef.current?.update({ present });
    if (!node && !present) setMounted(false);
  }, [node, present]);

  if (!mounted && !present) return null;

  const child = typeof children === 'function' ? children({ present }) : children;
  const childRef = (child.props as { ref?: React.Ref<HTMLElement> }).ref
    ?? (child as unknown as { ref?: React.Ref<HTMLElement> }).ref;
  return React.cloneElement(child, {
    ref: (element: HTMLElement | null) => {
      setNode(element);
      if (typeof childRef === 'function') childRef(element);
      else if (childRef && typeof childRef === 'object') {
        (childRef as React.MutableRefObject<HTMLElement | null>).current = element;
      }
    },
    'data-state': present ? 'open' : 'closed',
  });
};
