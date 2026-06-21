/**
 * BookingCard — back-compat alias of StickyReserveCard (v3). The booking widget was
 * renamed/upgraded to StickyReserveCard; this re-export keeps existing imports working
 * (the original 6 props are a subset of the new optional signature).
 */
export { StickyReserveCard, StickyReserveCard as BookingCard } from "./StickyReserveCard";
