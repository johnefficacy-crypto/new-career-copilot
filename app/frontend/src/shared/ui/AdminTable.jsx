import React from "react";

// Generic admin table — uses the prototype `.tbl` class so density,
// borders, hover and header styling match across every admin surface.
export default function AdminTable({
  columns = [],
  rows = [],
  getRowKey,
  renderRowActions,
  emptyMessage = "No records found.",
  testId,
}) {
  return (
    <div
      className="soft-card grain relative overflow-auto rounded-[18px]"
      data-testid={testId}
    >
      <table className="tbl min-w-[1100px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === "right" ? "right" : ""}>
                {c.header}
              </th>
            ))}
            {renderRowActions ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (renderRowActions ? 1 : 0)}
                className="text-clay-700"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={getRowKey(r)}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={c.align === "right" ? "right" : ""}
                  >
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
                {renderRowActions ? <td>{renderRowActions(r)}</td> : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
