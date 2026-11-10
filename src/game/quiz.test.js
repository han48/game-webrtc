import { describe, expect, it } from 'vitest';
import { getQuizAnswerAtPosition, parseQuizCsv } from './quiz.js';
import { QuizSession, QUIZ_QUESTION_SECONDS } from './quiz-session.js';

const validCsv = 'question,A,B,C,D,answer\r\n"What, exactly?",One,Two,Three,Four,b\r\n';
const question = parseQuizCsv(validCsv)[0];
const zones = ['A', 'B', 'C', 'D'].map((answer, index) => ({
  answer,
  x: index * 4 - 6,
  z: 0,
  width: 3,
  depth: 4,
}));

describe('quiz CSV', () => {
  it('parses quoted commas, escaped quotes, BOM, and Vietnamese headers', () => {
    expect(parseQuizCsv('\uFEFFCâu hỏi,A,B,C,D,Đáp án\r\n"Bạn chọn ""A"", đúng không?",Một,Hai,Ba,Bốn,a'))
      .toEqual([{
        id: 0,
        question: 'Bạn chọn "A", đúng không?',
        options: { A: 'Một', B: 'Hai', C: 'Ba', D: 'Bốn' },
        answer: 'A',
      }]);
  });

  it('rejects missing columns, invalid answers, and unclosed quotes', () => {
    expect(() => parseQuizCsv('question,A,B,C,D,answer\nQ,1,2,3,4,E')).toThrow(/dòng 2/i);
    expect(() => parseQuizCsv('question,A,B,C,answer\nQ,1,2,3,A')).toThrow(/các cột/i);
    expect(() => parseQuizCsv('question,A,B,C,D,answer\n"Q,1,2,3,4,A')).toThrow(/ngoặc kép/i);
  });
});

describe('quiz answer zones and session', () => {
  it('maps a player position to one answer zone', () => {
    expect(getQuizAnswerAtPosition({ x: -6, z: 0 }, zones)).toBe('A');
    expect(getQuizAnswerAtPosition({ x: 2, z: 0 }, zones)).toBe('C');
    expect(getQuizAnswerAtPosition({ x: 20, z: 0 }, zones)).toBeNull();
  });

  it('eliminates players outside the correct zone and hides the answer until resolution', () => {
    const session = new QuizSession();
    session.load([question, { ...question, id: 1 }]);
    session.start([{ peerId: 'one', name: 'One' }, { peerId: 'two', name: 'Two' }], 1000);
    expect(session.snapshot().question).toEqual({ question: question.question, options: question.options });
    expect(session.snapshot().question.answer).toBeUndefined();

    const positions = new Map([['one', { x: -2, z: 0 }], ['two', { x: -6, z: 0 }]]);
    expect(session.advance(positions, zones, 1000 + QUIZ_QUESTION_SECONDS * 1000)).toBe(true);
    expect(session.snapshot().players).toMatchObject([
      { peerId: 'one', alive: true },
      { peerId: 'two', alive: false },
    ]);
    expect(session.snapshot().lastResult).toEqual({ answer: 'B', eliminated: ['two'] });
  });

  it('finishes after the final question with surviving players as winners', () => {
    const session = new QuizSession();
    session.load([question]);
    session.start([{ peerId: 'one', name: 'One' }], 0);
    session.advance(new Map([['one', { x: -2, z: 0 }]]), zones, QUIZ_QUESTION_SECONDS * 1000);
    expect(session.phase).toBe('finished');
    expect(session.snapshot().players[0].alive).toBe(true);
  });

  it('restarts a finished quiz while retaining the uploaded questions', () => {
    const session = new QuizSession();
    session.load([question]);
    session.start([{ peerId: 'one', name: 'One' }], 0);
    session.advance(new Map([['one', { x: -2, z: 0 }]]), zones, QUIZ_QUESTION_SECONDS * 1000);

    expect(session.reset()).toBe(true);
    expect(session.snapshot()).toMatchObject({
      phase: 'lobby',
      questionCount: 1,
      questionIndex: 0,
      players: [],
    });
    expect(session.start([{ peerId: 'one', name: 'One' }], 2000)).toBe(true);
  });
});
