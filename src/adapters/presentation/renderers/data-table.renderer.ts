import type { DataTableSlide } from "../../../application/dto/slide-plan.dto.js";
import { type SlideRequest, type SlideRenderer, C, CW, MX, CONTENT_Y, CONTENT_H, uid, addPageTitle, applyTableTextStyle } from "./base.renderer.js";

export class DataTableRenderer implements SlideRenderer<DataTableSlide> {
  render(r: SlideRequest[], d: DataTableSlide): void {
    const s = uid("dt");
    r.push({ createSlide: { objectId: s } });
    addPageTitle(r, s, d.title);

    const dataRows = d.rows.slice(0, 6);
    const rows = dataRows.length + 1;
    const cols = d.columns.length;
    const tableId = uid("tbl");

    r.push({
      createTable: {
        objectId: tableId,
        elementProperties: {
          pageObjectId: s,
          size: { width: { magnitude: CW, unit: "EMU" }, height: { magnitude: Math.min(rows * 550_000, CONTENT_H), unit: "EMU" } },
          transform: { scaleX: 1, scaleY: 1, translateX: MX, translateY: CONTENT_Y, unit: "EMU" },
        },
        rows,
        columns: cols,
      },
    });

    // ヘッダー
    for (let c = 0; c < cols; c++) {
      r.push({
        insertText: {
          objectId: tableId,
          cellLocation: { rowIndex: 0, columnIndex: c },
          text: d.columns[c],
          insertionIndex: 0,
        },
      });
    }

    // ヘッダースタイル
    r.push({
      updateTableCellProperties: {
        objectId: tableId,
        tableRange: { location: { rowIndex: 0, columnIndex: 0 }, rowSpan: 1, columnSpan: cols },
        tableCellProperties: { tableCellBackgroundFill: { solidFill: { color: { rgbColor: C.sky } } } },
        fields: "tableCellBackgroundFill",
      },
    });

    // データ行
    for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
      const rowData = dataRows[rowIdx];
      for (let c = 0; c < cols; c++) {
        r.push({
          insertText: {
            objectId: tableId,
            cellLocation: { rowIndex: rowIdx + 1, columnIndex: c },
            text: rowData[c] || "",
            insertionIndex: 0,
          },
        });
      }
    }

    applyTableTextStyle(r, tableId, rows, cols, 11);
  }
}
