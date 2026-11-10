const HEADER_ALIASES = {
  question: ['question', 'question text', 'cau hoi'],
  answer: ['answer', 'correct answer', 'dap an', 'dap an dung'],
};

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .trim()
}

function parseCsvRecords(text) {
  const records = [];
  let record = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ',') {
      record.push(value);
      value = '';
    } else if (character === '\n' || character === '\r') {
      record.push(value);
      if (record.some((cell) => cell.trim())) records.push(record);
      record = [];
      value = '';
      if (character === '\r' && text[index + 1] === '\n') index += 1;
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error('CSV có dấu ngoặc kép chưa được đóng.');
  record.push(value);
  if (record.some((cell) => cell.trim())) records.push(record);
  return records;
}

function findHeader(headers, aliases) {
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

export function parseQuizCsv(csvText) {
  if (typeof csvText !== 'string' || !csvText.trim()) {
    throw new Error('File CSV đang trống.');
  }
  if (new TextEncoder().encode(csvText).length > 1024 * 1024) {
    throw new Error('File CSV vượt quá giới hạn 1 MB.');
  }

  const records = parseCsvRecords(csvText.replace(/^\uFEFF/, ''));
  if (records.length < 2) throw new Error('CSV cần có hàng tiêu đề và ít nhất một câu hỏi.');

  const headers = records[0];
  const questionColumn = findHeader(headers, HEADER_ALIASES.question);
  const answerColumn = findHeader(headers, HEADER_ALIASES.answer);
  const optionColumns = ['A', 'B', 'C', 'D'].map((letter) => (
    headers.findIndex((header) => normalizeHeader(header) === letter.toLowerCase())
  ));
  if (questionColumn < 0 || answerColumn < 0 || optionColumns.some((column) => column < 0)) {
    throw new Error('CSV cần các cột: question, A, B, C, D, answer (có thể dùng “Câu hỏi” và “Đáp án”).');
  }

  const questions = records.slice(1).map((record, index) => {
    const question = (record[questionColumn] || '').trim();
    const options = Object.fromEntries(optionColumns.map((column, optionIndex) => (
      [['A', 'B', 'C', 'D'][optionIndex], (record[column] || '').trim()]
    )));
    const answer = (record[answerColumn] || '').trim().toUpperCase();
    if (!question || Object.values(options).some((option) => !option) || !['A', 'B', 'C', 'D'].includes(answer)) {
      throw new Error(`Dữ liệu câu hỏi ở dòng ${index + 2} không hợp lệ; cần câu hỏi, đủ 4 lựa chọn và đáp án A/B/C/D.`);
    }
    if (question.length > 2000 || Object.values(options).some((option) => option.length > 500)) {
      throw new Error(`Nội dung ở dòng ${index + 2} quá dài.`);
    }
    return { id: index, question, options, answer };
  });
  if (questions.length > 100) throw new Error('Mỗi file chỉ được có tối đa 100 câu hỏi.');
  return questions;
}

export function getQuizAnswerAtPosition(position, zones) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return null;
  const zone = zones.find(({ x, z, width, depth }) => (
    Math.abs(position.x - x) <= width / 2
    && Math.abs(position.z - z) <= depth / 2
  ));
  return zone?.answer || null;
}
