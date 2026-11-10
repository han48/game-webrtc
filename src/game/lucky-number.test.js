import { describe, expect, it } from 'vitest';
import { getLuckySpinNumber, isLuckyNumber, LUCKY_SPIN_MS, LuckyNumberSession } from './lucky-number.js';

describe('lucky number game', () => {
  it('accepts exactly four digits, including leading zeros', () => {
    expect(isLuckyNumber('0000')).toBe(true);
    expect(isLuckyNumber('0042')).toBe(true);
    expect(isLuckyNumber('9999')).toBe(true);
    expect(isLuckyNumber('123')).toBe(false);
    expect(isLuckyNumber('12345')).toBe(false);
    expect(isLuckyNumber('1a23')).toBe(false);
  });

  it('draws randomly from submitted numbers and prevents changes after the first spin', () => {
    const session = new LuckyNumberSession();
    session.addPlayer('one', 'One');
    session.addPlayer('two', 'Two');
    session.setNumber('one', '0042');
    session.setNumber('two', '9001');

    expect(getLuckySpinNumber(['0042', '9001'], () => 0.99)).toBe('9001');
    expect(session.spin(100, () => 0.99)).toBe(true);
    expect(session.snapshot()).toMatchObject({
      phase: 'spinning',
      locked: true,
      currentNumber: '9001',
      spinEndsAt: 100 + LUCKY_SPIN_MS,
    });
    expect(session.setNumber('one', '1111')).toBe(false);
    expect(session.finishSpin(100 + LUCKY_SPIN_MS - 1)).toBe(false);
    expect(session.finishSpin(100 + LUCKY_SPIN_MS)).toBe(true);
    expect(session.snapshot().winners).toEqual(['two']);
  });

  it('weights repeated picks by the number of players and requires all players to choose', () => {
    const session = new LuckyNumberSession();
    session.addPlayer('one', 'One');
    session.addPlayer('two', 'Two');
    session.addPlayer('three', 'Three');
    session.setNumber('one', '1000');
    session.setNumber('two', '2000');
    expect(session.spin(0, () => 0.49)).toBe(false);
    session.setNumber('three', '2000');
    expect(getLuckySpinNumber(['1000', '2000', '2000'], () => 0.49)).toBe('2000');
    expect(session.spin(0, () => 0.49)).toBe(true);
    expect(session.snapshot().currentNumber).toBe('2000');
  });

  it('allows multiple non-repeating draws and finishes the game', () => {
    const session = new LuckyNumberSession();
    session.addPlayer('one', 'One');
    session.addPlayer('two', 'Two');
    session.addPlayer('three', 'Three');
    session.setNumber('one', '1000');
    session.setNumber('two', '2000');
    session.setNumber('three', '2000');

    session.spin(0, () => 0);
    session.finishSpin(LUCKY_SPIN_MS);
    expect(session.snapshot().winners).toEqual(['one']);
    expect(session.spin(LUCKY_SPIN_MS, () => 0)).toBe(true);
    session.finishSpin(LUCKY_SPIN_MS * 2);
    expect(session.snapshot().drawnNumbers).toEqual(['1000', '2000']);
    expect(session.snapshot().winners).toEqual(['one', 'two', 'three']);
    expect(session.spin(LUCKY_SPIN_MS * 2)).toBe(false);
    expect(session.finish()).toBe(true);
    expect(session.phase).toBe('finished');
  });

  it('rejects spinning before any valid number is chosen', () => {
    const session = new LuckyNumberSession();
    session.addPlayer('one', 'One');
    expect(session.spin()).toBe(false);
  });
});
