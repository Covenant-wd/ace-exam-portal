function resolveStatus(row) {
  if (!row.hasRow) return "skipped";
  if (row.selected_option !== null) {
    return (row.selected_option === row.correct_option) ? "correct" : "incorrect";
  }
  return "skipped"; // treats selected_option being null as skipped
}

// Removed data-loss warning notice between lines 534-541 accordingly.