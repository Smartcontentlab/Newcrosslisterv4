/**
 * Take-home maths for Poshmark, Depop and Mercari (US), plus the weight cheat sheet.
 *
 * Rules (checked September 2026 against each marketplace's own announcements):
 * - Poshmark: $2.95 flat under $15, otherwise 20%. The buyer pays the standard label (currently $6.49, up to 5 lb).
 *   Sellers pay only an upgrade for heavier parcels: $5 for 5.1-10 lb, $10 for 10.1-15 lb.
 * - Depop (US): 0% selling fee. Payment processing 3.3% + $0.45 on item price plus shipping. Optional boost is 12%.
 * - Mercari (US): 10% of item price plus buyer-paid shipping. No separate processing fee.
 * These are planning estimates. Fee rules change; confirm on each marketplace before posting.
 */

export type ShipPayer = 'buyer' | 'seller';
export type ShipAssumptions = { payer: ShipPayer; cost: string; boosted: boolean };
export type FeeLine = { label: string; amount: number };
export type TakeHome = {
  platform: 'Poshmark' | 'Depop' | 'Mercari';
  net: number;
  fees: number;
  profit: number | null;
  lines: FeeLine[];
};

export const initialShip: ShipAssumptions = { payer: 'buyer', cost: '', boosted: false };

export const POSHMARK_LABEL = 6.49;
/** Typical label cost used when the seller has not typed one. Mercari changes its label prices on Oct 19, 2026 and Depop publishes no fixed tiers, so this stays an editable estimate. */
export const DEFAULT_SHIPPING = 6.49;
const POSHMARK_FLAT_BELOW = 15;
const DEPOP_RATE = 0.033;
const DEPOP_FIXED = 0.45;
const DEPOP_BOOST = 0.12;
const MERCARI_RATE = 0.1;

const num = (value: string | number | undefined) => Math.max(0, Number(value) || 0);
/** The shipping amount in play: what the seller typed, otherwise the typical label. */
export const shippingAmount = (ship: ShipAssumptions) => (num(ship.cost) > 0 ? num(ship.cost) : DEFAULT_SHIPPING);
const round2 = (value: number) => Math.round(value * 100) / 100;

export function poshmarkUpgrade(weightLb: number): number {
  if (weightLb > 10) return 10;
  if (weightLb > 5) return 5;
  return 0;
}

export function takeHome(price: number, ship: ShipAssumptions, weightLb: number, paid: number): TakeHome[] {
  const cost = shippingAmount(ship);
  const sellerPays = ship.payer === 'seller';
  const buyerShip = sellerPays ? 0 : cost;

  const build = (platform: TakeHome['platform'], lines: FeeLine[]): TakeHome => {
    const fees = lines.reduce((sum, line) => sum + line.amount, 0);
    const net = price > 0 ? price - fees : 0;
    return {
      platform,
      lines: price > 0 ? lines.map((line) => ({ ...line, amount: round2(line.amount) })) : [],
      fees: price > 0 ? round2(fees) : 0,
      net: round2(net),
      profit: paid > 0 && price > 0 ? round2(net - paid) : null,
    };
  };

  const poshLines: FeeLine[] = [{ label: price < POSHMARK_FLAT_BELOW ? 'Flat fee (under $15)' : 'Commission (20%)', amount: price < POSHMARK_FLAT_BELOW ? 2.95 : price * 0.2 }];
  const upgrade = poshmarkUpgrade(weightLb);
  if (upgrade) poshLines.push({ label: `Label upgrade (${weightLb} lb)`, amount: upgrade });
  if (sellerPays) poshLines.push({ label: 'Free shipping you cover', amount: cost });

  const depopLines: FeeLine[] = [{ label: 'Processing (3.3% + $0.45)', amount: (price + buyerShip) * DEPOP_RATE + DEPOP_FIXED }];
  if (ship.boosted) depopLines.push({ label: 'Boost (12%)', amount: price * DEPOP_BOOST });
  if (sellerPays) depopLines.push({ label: 'Shipping you cover', amount: cost });

  const mercariLines: FeeLine[] = [{ label: buyerShip > 0 ? 'Selling fee (10% of price + shipping)' : 'Selling fee (10%)', amount: (price + buyerShip) * MERCARI_RATE }];
  if (sellerPays) mercariLines.push({ label: 'Shipping you cover', amount: cost });

  return [build('Poshmark', poshLines), build('Depop', depopLines), build('Mercari', mercariLines)];
}

/** The list price that leaves you with `target` dollars, per platform. */
export function listPriceFor(target: number, ship: ShipAssumptions, weightLb: number): Record<TakeHome['platform'], number> {
  const cost = shippingAmount(ship);
  const sellerPays = ship.payer === 'seller';
  const buyerShip = sellerPays ? 0 : cost;
  const ceil2 = (value: number) => Math.ceil(value * 100 - 1e-9) / 100;

  const poshExtras = poshmarkUpgrade(weightLb) + (sellerPays ? cost : 0);
  const flat = target + 2.95 + poshExtras;
  const percent = (target + poshExtras) / 0.8;
  const poshmark = flat < POSHMARK_FLAT_BELOW ? flat : Math.max(percent, POSHMARK_FLAT_BELOW);

  const depopKeep = 1 - DEPOP_RATE - (ship.boosted ? DEPOP_BOOST : 0);
  const depop = (target + DEPOP_RATE * buyerShip + DEPOP_FIXED + (sellerPays ? cost : 0)) / depopKeep;

  const mercari = (target + MERCARI_RATE * buyerShip + (sellerPays ? cost : 0)) / (1 - MERCARI_RATE);

  return { Poshmark: ceil2(poshmark), Depop: ceil2(depop), Mercari: ceil2(mercari) };
}

/**
 * Typical shipped weights, in pounds. Ranges come from published shipping guides and are rough:
 * soft goods assume a poly mailer, shoes and coats assume a box. Weigh on a scale when you can.
 */
export const WEIGHT_USUALS: { label: string; range: string; fill: number }[] = [
  { label: 'Tee / tank', range: '0.3–0.5', fill: 0.4 },
  { label: 'Long sleeve / polo / button-up', range: '0.4–0.6', fill: 0.5 },
  { label: 'Sweater', range: '0.5–1', fill: 0.75 },
  { label: 'Dress', range: '0.6–0.9', fill: 0.75 },
  { label: 'Jeans', range: '1–2', fill: 1.5 },
  { label: 'Hoodie / sweatshirt', range: '1–1.5', fill: 1.25 },
  { label: 'Jacket / coat', range: '1.5–3', fill: 2 },
  { label: 'Sandals / heels', range: '0.6–1.2', fill: 1 },
  { label: 'Sneakers (boxed)', range: '1.8–2.5', fill: 2.3 },
  { label: 'Boots (boxed)', range: '1.8–4.4', fill: 3 },
];
