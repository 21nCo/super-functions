import { acquireUIFnDomPlatform, createUIFnPresence } from '@uifn/dom';
import React from 'react';
import { composeReactRefs } from './utils/slot';

type AnyProps = Record<string, unknown>;

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

  const child = (typeof children === 'function' ? children({ present }) : children) as React.ReactElement<AnyProps>;
  const childRef = (child.props as AnyProps & { ref?: React.Ref<HTMLElement> }).ref
    ?? (child as unknown as { ref?: React.Ref<HTMLElement> }).ref;
  return React.cloneElement(child, {
    ref: composeReactRefs((element: HTMLElement | null) => setNode(element), childRef),
    'data-state': present ? 'open' : 'closed',
  });
};
