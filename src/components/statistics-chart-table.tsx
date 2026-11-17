export function StatisticsChartTable({
  caption,
  headings,
  rows,
}: {
  caption: string;
  headings: string[];
  rows: string[][];
}) {
  return (
    <details className="lab-table-toggle mt-2">
      <summary>Ver datos</summary>
      <div
        role="region"
        aria-label={caption}
        tabIndex={0}
        className="overflow-x-auto"
      >
        <table
          className={
            headings.length > 3
              ? "lab-mini-table w-full min-w-80 text-left"
              : "lab-mini-table w-full text-left"
          }
        >
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {headings.map((heading) => (
                <th key={heading} scope="col">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join("|")}>
                {row.map((cell, index) => (
                  <td key={`${index}-${cell}`} className="tabular-nums">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
