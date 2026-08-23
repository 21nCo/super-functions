import { resolveUIFnPortalTarget } from '@uifn/dom';
import React from 'react';
import ReactDOM from 'react-dom';

export interface PortalProps {
  children?: React.ReactNode;
  container?: HTMLElement | null;
}

export const Portal: React.FC<PortalProps> = ({ children, container }) => {
  const [portalReady, setPortalReady] = React.useState(false);
  const ownerDocument = container?.ownerDocument
    ?? (typeof document === 'undefined' ? null : document);
  const mountNode = React.useMemo(
    () => ownerDocument
      ? resolveUIFnPortalTarget(ownerDocument, container ?? undefined)
      : null,
    [container, ownerDocument],
  );

  React.useEffect(() => {
    setPortalReady(true);
  }, []);

  // Portals have no server-rendered owner. Keeping descendants absent until
  // the portal is ready means they mount once under their final portal owner,
  // instead of first mounting in a fragment and then remounting after hydration.
  if (!mountNode || !portalReady) return null;

  try {
    return ReactDOM.createPortal(children, mountNode);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Portals are not currently supported')) {
      return null;
    }
    throw error;
  }
};
