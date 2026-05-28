import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatDate } from "./format";

export type ExportColumn = {
  header: string;
  dataKey: string;
};

export function exportToPDF(title: string, columns: ExportColumn[], data: any[]) {
  const doc = new jsPDF();
  
  doc.setFontSize(16);
  doc.text(title, 14, 15);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${formatDate(new Date().toISOString())}`, 14, 22);

  const tableData = data.map(row => 
    columns.map(col => row[col.dataKey] ?? "")
  );

  (doc as any).autoTable({
    startY: 28,
    head: [columns.map(c => c.header)],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185] }
  });

  doc.save(`${title.replace(/\s+/g, "_").toLowerCase()}.pdf`);
}

export function exportToExcel(title: string, data: any[]) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
  
  XLSX.writeFile(wb, `${title.replace(/\s+/g, "_").toLowerCase()}.xlsx`);
}
