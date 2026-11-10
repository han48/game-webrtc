import { getQuizAnswerAtPosition } from './quiz.js';

export const QUIZ_QUESTION_SECONDS = 20;

export class QuizSession {
  constructor() {
    this.phase = 'lobby';
    this.questions = [];
    this.players = new Map();
    this.questionIndex = 0;
    this.endsAt = null;
    this.lastResult = null;
  }

  load(questions) {
    if (this.phase !== 'lobby' || !Array.isArray(questions) || !questions.length) return false;
    this.questions = questions.map((question) => ({
      id: question.id,
      question: question.question,
      options: { ...question.options },
      answer: question.answer,
    }));
    return true;
  }

  start(players, now = Date.now()) {
    if (this.phase !== 'lobby' || !this.questions.length || !players.length) return false;
    this.players = new Map(players.map(({ peerId, name }) => [peerId, {
      peerId,
      name,
      alive: true,
    }]));
    this.questionIndex = 0;
    this.phase = 'question';
    this.endsAt = now + QUIZ_QUESTION_SECONDS * 1000;
    this.lastResult = null;
    return true;
  }

  leave(peerId) {
    return this.players.delete(peerId);
  }

  advance(positions, zones, now = Date.now()) {
    if (this.phase !== 'question' || now < this.endsAt) return false;
    const question = this.questions[this.questionIndex];
    const eliminated = [];
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      if (getQuizAnswerAtPosition(positions.get(player.peerId), zones) !== question.answer) {
        player.alive = false;
        eliminated.push(player.peerId);
      }
    }
    this.lastResult = { answer: question.answer, eliminated };

    const aliveCount = [...this.players.values()].filter((player) => player.alive).length;
    this.questionIndex += 1;
    if (aliveCount <= 1 || this.questionIndex >= this.questions.length) {
      this.phase = 'finished';
      this.endsAt = null;
    } else {
      this.endsAt = now + QUIZ_QUESTION_SECONDS * 1000;
    }
    return true;
  }

  reset() {
    if (this.phase !== 'finished') return false;
    this.phase = 'lobby';
    this.players.clear();
    this.questionIndex = 0;
    this.endsAt = null;
    this.lastResult = null;
    return true;
  }

  snapshot() {
    const question = this.questions[this.questionIndex];
    return {
      phase: this.phase,
      players: [...this.players.values()].map((player) => ({ ...player })),
      questionIndex: this.questionIndex,
      questionCount: this.questions.length,
      question: question ? {
        question: question.question,
        options: { ...question.options },
      } : null,
      endsAt: this.endsAt,
      lastResult: this.lastResult ? { ...this.lastResult, eliminated: [...this.lastResult.eliminated] } : null,
    };
  }
}
