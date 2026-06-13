export function exportCSV<T>(
  data: T[],
  filename: string,
  columns: { key: keyof T; label: string }[]
) {
  const header = columns.map(c => c.label).join(",");
  const rows = data.map(item =>
    columns.map(c => {
      const val = (item as any)[c.key as string];
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(",")
  );
  const csv = [header, ...rows].join("\r\n");
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
