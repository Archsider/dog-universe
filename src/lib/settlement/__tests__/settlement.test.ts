import { describe, it, expect } from 'vitest';
import {
  SETTLEMENT_LAG_BUSINESS_DAYS,
  addBankBusinessDays,
  computeSettlementYmd,
  explainSettlement,
} from '../index';

describe('settlement — addBankBusinessDays', () => {
  it('n<=0 renvoie le jour inchangé', () => {
    expect(addBankBusinessDays('2026-05-29', 0)).toBe('2026-05-29');
    expect(addBankBusinessDays('2026-05-29', -3)).toBe('2026-05-29');
  });

  it('saute le weekend : vendredi +1 ouvré = lundi', () => {
    // 2026-05-29 vendredi → +1 ouvré → lundi 2026-06-01
    expect(addBankBusinessDays('2026-05-29', 1)).toBe('2026-06-01');
  });

  it('saute weekend + férié : +2 ouvrés franchit le pont', () => {
    // Jeudi 2026-06-04 +2 ouvrés = lundi 2026-06-08 (sauf férié) ; ici test
    // simple weekend : vendredi +2 ouvrés = mardi.
    expect(addBankBusinessDays('2026-05-29', 2)).toBe('2026-06-02');
  });
});

describe('settlement — computeSettlementYmd (cas métier)', () => {
  it('espèces = jour même', () => {
    expect(computeSettlementYmd('2026-05-29', 'CASH')).toBe('2026-05-29');
    // même un samedi : l\'argent est en main
    expect(computeSettlementYmd('2026-05-30', 'CASH')).toBe('2026-05-30');
  });

  it('TPE/virement de fin de mois → crédit en JUIN (le cas réel)', () => {
    // Vendredi 2026-05-29 par TPE → +1 ouvré → saute samedi 30 + dimanche 31
    // → lundi 2026-06-01. Le CA tombe donc en JUIN, pas en mai. ✅
    expect(computeSettlementYmd('2026-05-29', 'CARD')).toBe('2026-06-01');
    // Jeudi 2026-05-28 (Aïd) par TPE → +1 ouvré → premier jour ouvré =
    // vendredi 2026-05-29 (jour ouvré officiel). Reste en mai sauf si la
    // banque a aussi ponté le vendredi (l'opérateur ajuste alors la date).
    expect(computeSettlementYmd('2026-05-28', 'CARD')).toBe('2026-05-29');
  });

  it('chèque émis mardi 26 mai → encaissé lundi 1 juin (Aïd + weekend sautés)', () => {
    // +2 ouvrés depuis mardi 26 : saute 27-28 (Aïd) puis 30-31 (weekend),
    // ouvrés = vendredi 29 (1) puis lundi 1 juin (2) → 2026-06-01.
    expect(computeSettlementYmd('2026-05-26', 'CHECK')).toBe('2026-06-01');
  });

  it('virement vendredi → crédit lundi (date de valeur J+1 ouvré)', () => {
    expect(computeSettlementYmd('2026-05-29', 'TRANSFER')).toBe('2026-06-01');
  });

  it('chèque vendredi → +2 ouvrés = mardi', () => {
    expect(computeSettlementYmd('2026-05-29', 'CHECK')).toBe('2026-06-02');
  });

  it('en pleine semaine ordinaire, TPE = simplement le lendemain', () => {
    // Mardi 2026-06-02 → mercredi 2026-06-03.
    expect(computeSettlementYmd('2026-06-02', 'CARD')).toBe('2026-06-03');
  });

  it('config des délais verrouillée', () => {
    expect(SETTLEMENT_LAG_BUSINESS_DAYS).toEqual({
      CASH: 0,
      CARD: 1,
      TRANSFER: 1,
      CHECK: 2,
    });
  });
});

describe('settlement — explainSettlement (traçabilité UI)', () => {
  it('liste les jours sautés avec leur raison (Aïd + weekend)', () => {
    // Chèque émis mardi 26 mai, +2 ouvrés : saute 27-28 (Aïd) + 30-31 (weekend).
    const exp = explainSettlement('2026-05-26', 'CHECK');
    expect(exp.settlementYmd).toBe('2026-06-01');
    expect(exp.lagBusinessDays).toBe(2);
    const reasons = exp.skipped.map((s) => `${s.ymd}:${s.reason}`);
    expect(reasons).toContain('2026-05-27:holiday');
    expect(reasons).toContain('2026-05-28:holiday');
    expect(reasons).toContain('2026-05-30:weekend');
    expect(reasons).toContain('2026-05-31:weekend');
  });

  it('espèces : aucun jour sauté, settlement = paidOn', () => {
    const exp = explainSettlement('2026-05-29', 'CASH');
    expect(exp.settlementYmd).toBe('2026-05-29');
    expect(exp.skipped).toEqual([]);
  });
});
