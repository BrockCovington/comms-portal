"use client";

import { createContext, useContext } from "react";

type MobileNavContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function MobileNavProvider({
  value,
  children,
}: {
  value: MobileNavContextValue;
  children: React.ReactNode;
}) {
  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

// Safe default (no-op) so components using this outside the provider — e.g.
// in isolation — don't crash, they just render as if the drawer were closed.
export function useMobileNav(): MobileNavContextValue {
  return useContext(MobileNavContext) ?? { open: false, setOpen: () => {} };
}
