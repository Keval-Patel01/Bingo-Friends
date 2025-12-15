// Generate Bingo card
export const generateBingoCard = (size) => {
  const total = size * size;
  const numbers = Array.from({ length: total }, (_, i) => i + 1);

  // Shuffle numbers
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }

  return numbers.map((num, index) => ({
    key: index,
    number: num,
    marked: false,
  }));
};

// Count completed lines for B I N G O
export const countCompletedLines = (card, size) => {
  let lines = 0;

  const marked = (r, c) => card[r * size + c]?.marked;

  // Rows
  for (let r = 0; r < size; r++) {
    if ([...Array(size)].every((_, c) => marked(r, c))) lines++;
  }

  // Columns
  for (let c = 0; c < size; c++) {
    if ([...Array(size)].every((_, r) => marked(r, c))) lines++;
  }

  // Diagonals
  if ([...Array(size)].every((_, i) => marked(i, i))) lines++;
  if ([...Array(size)].every((_, i) => marked(i, size - 1 - i))) lines++;

  return lines;
};
