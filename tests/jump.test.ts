/**
 * Kalibracja skoku (PRD 2.0 §2): apex mierzony symulacją Eulera dt=1/60,
 * GRAVITY 640. Tosia 4,0 ± 0,2 kratki (64 ± 3,2 px), Vega 3,2 ± 0,2
 * (51,2 ± 3,2 px). JUMP_V0 w balance.ts jest dostrojone do tego testu.
 */
import { describe, expect, it } from 'vitest';
import { CHARACTERS, DT60 } from '../src/core/balance';
import { measureJumpApex } from '../src/core/physicsSim';

describe('kalibracja skoku (apex w px)', () => {
  it('Tosia: apex 64 ± 3,2 px (4,0 ± 0,2 kratki)', () => {
    const apex = measureJumpApex(CHARACTERS.TOSIA, DT60);
    expect(apex).toBeGreaterThanOrEqual(64 - 3.2);
    expect(apex).toBeLessThanOrEqual(64 + 3.2);
  });

  it('Vega: apex 51,2 ± 3,2 px (3,2 ± 0,2 kratki)', () => {
    const apex = measureJumpApex(CHARACTERS.VEGA, DT60);
    expect(apex).toBeGreaterThanOrEqual(51.2 - 3.2);
    expect(apex).toBeLessThanOrEqual(51.2 + 3.2);
  });

  it('Tosia skacze wyżej niż Vega', () => {
    expect(measureJumpApex(CHARACTERS.TOSIA, DT60))
      .toBeGreaterThan(measureJumpApex(CHARACTERS.VEGA, DT60));
  });
});
