export function isRowEditing(editing, selected, id) {
  return editing && (selected.size !== 1 || selected.has(id) || selected.has(String(id)));
}

export function selectedRecordPage(records, selected, page, size, key = row => row.id) {
  if (selected.size !== 1) return page;
  const index = records.findIndex(row => selected.has(key(row)) || selected.has(String(key(row))));
  return index < 0 ? page : Math.floor(index / size) + 1;
}

export function toggleTableSelection(selected, records, key = row => String(row.id)) {
  const all=records.length>0&&records.every(row=>selected.has(key(row)));
  for (const row of records) if(all)selected.delete(key(row));else selected.add(key(row));
}

