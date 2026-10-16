import { createContext, useContext } from 'react';
export const BillingContext = createContext(null);
export const useBilling = () => useContext(BillingContext);
