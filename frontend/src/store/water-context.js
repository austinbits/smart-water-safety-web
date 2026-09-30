import { createContext, useContext } from "react";

// Context definition stays separate from the provider so React hot reloading
// can update components without unnecessarily recreating the provider module.
export const Context = createContext(null);

/** Access the shared water-safety workspace state. */
export const useWater = () => useContext(Context);
