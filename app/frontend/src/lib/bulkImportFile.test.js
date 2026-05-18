import { parseCsvToRows, parseImportFile } from "./bulkImportFile";

describe("parseCsvToRows", () => {
  test("parses a simple header + two rows with type coercion", () => {
    const csv = "slug,name,is_active\nupsc,UPSC,true\nssc,SSC,false";
    const { rows, errors } = parseCsvToRows(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { slug: "upsc", name: "UPSC", is_active: true },
      { slug: "ssc", name: "SSC", is_active: false },
    ]);
  });

  test("coerces integers, decimals, and leaves leading-zero strings alone", () => {
    const csv = "code,marks,pincode\nA,105.5,001\nB,42,002";
    const { rows } = parseCsvToRows(csv);
    expect(rows[0]).toEqual({ code: "A", marks: 105.5, pincode: "001" });
    expect(rows[1]).toEqual({ code: "B", marks: 42, pincode: "002" });
  });

  test("parses quoted fields with embedded commas and quotes", () => {
    const csv = `name,note\n"Smith, J.","said ""hi"" today"\nDoe,plain`;
    const { rows } = parseCsvToRows(csv);
    expect(rows[0]).toEqual({ name: "Smith, J.", note: 'said "hi" today' });
    expect(rows[1]).toEqual({ name: "Doe", note: "plain" });
  });

  test("parses nested JSON objects in cells", () => {
    const csv = `exam_id,vacancy_by_category\nexam-1,"{""general"":400,""obc"":230}"`;
    const { rows } = parseCsvToRows(csv);
    expect(rows[0].vacancy_by_category).toEqual({ general: 400, obc: 230 });
  });

  test("empty cells become null", () => {
    const csv = "slug,name,description\nupsc,UPSC,\nssc,SSC,Staff Sel";
    const { rows } = parseCsvToRows(csv);
    expect(rows[0].description).toBeNull();
    expect(rows[1].description).toBe("Staff Sel");
  });

  test("flags row-length mismatch as an error but keeps clean rows", () => {
    const csv = "a,b,c\n1,2,3\n4,5\n6,7,8";
    const { rows, errors } = parseCsvToRows(csv);
    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/row 3/);
  });

  test("rejects empty input", () => {
    const { rows, errors } = parseCsvToRows("");
    expect(rows).toEqual([]);
    expect(errors).toEqual(["empty input"]);
  });

  test("rejects empty header column", () => {
    const { rows, errors } = parseCsvToRows("a,,c\n1,2,3");
    expect(rows).toEqual([]);
    expect(errors).toEqual(["header row has empty column name"]);
  });
});

describe("parseImportFile", () => {
  test("routes .csv files through the CSV parser", () => {
    const { rows } = parseImportFile("data.csv", "slug,name\nupsc,UPSC");
    expect(rows).toEqual([{ slug: "upsc", name: "UPSC" }]);
  });

  test("routes .json files through JSON.parse and requires an array", () => {
    const ok = parseImportFile("data.json", '[{"slug":"upsc"}]');
    expect(ok.rows).toEqual([{ slug: "upsc" }]);

    const bad = parseImportFile("data.json", '{"slug":"upsc"}');
    expect(bad.rows).toEqual([]);
    expect(bad.errors[0]).toMatch(/array/);
  });

  test("PDF and MD return an explicit out-of-scope error", () => {
    const pdf = parseImportFile("paper.pdf", "%PDF-1.4...");
    expect(pdf.rows).toEqual([]);
    expect(pdf.errors[0]).toMatch(/unsupported file extension/);
    expect(pdf.errors[0]).toMatch(/separate pipeline/);

    const md = parseImportFile("syllabus.md", "# Header");
    expect(md.errors[0]).toMatch(/unsupported file extension/);
  });
});
