import { Buffer } from "node:buffer";
import { inflateRawSync, inflateSync } from "node:zlib";

// EXPORT-FIX: lectores independientes de los archivos descargados. No usan el
// código de producción: abren los bytes que recibiría el usuario (CSV, XLSX y
// PDF) para comprobar su contenido y no solo que el archivo exista.

export async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// CSV UTF-8 con BOM, separador ";" y celdas entre comillas. Devuelve las
// secciones separadas por línea vacía: { title, header, rows }.
export function parseCsvReport(text) {
  assertBom(text);
  const body = text.slice(1);
  const records = [];
  let record = [];
  let cell = "";
  let quoted = false;
  let started = false;
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (quoted) {
      if (char === '"' && body[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') {
      quoted = true;
      started = true;
    } else if (char === ";") {
      record.push(cell);
      cell = "";
      started = true;
    } else if (char === "\r" && body[i + 1] === "\n") {
      i += 1;
      record.push(cell);
      records.push(started || record.length > 1 ? record : []);
      record = [];
      cell = "";
      started = false;
    } else cell += char;
  }
  if (started || cell) {
    record.push(cell);
    records.push(record);
  }
  const sections = [];
  let current = null;
  for (const row of records.slice(2)) {
    if (row.length === 0) {
      current = null;
      continue;
    }
    if (!current) {
      current = { title: row[0], header: null, rows: [] };
      sections.push(current);
    } else if (!current.header) current.header = row;
    else current.rows.push(row);
  }
  return { title: records[0][0], note: records[1][0], sections };
}

function assertBom(text) {
  if (text.charCodeAt(0) !== 0xfeff) throw new Error("El CSV no tiene BOM");
}

function zipEntries(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("No es un ZIP");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const files = new Map();
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("ZIP roto");
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const dataStart =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(dataStart, dataStart + size);
    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescapeXml = (value) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code) =>
    code[0] === "#"
      ? String.fromCodePoint(
          code[1].toLowerCase() === "x"
            ? Number.parseInt(code.slice(2), 16)
            : Number(code.slice(1)),
        )
      : entities[code.toLowerCase()],
  );

const columnIndex = (reference) =>
  [...reference.replace(/\d+/g, "")].reduce(
    (total, letter) => total * 26 + letter.charCodeAt(0) - 64,
    0,
  ) - 1;

// Devuelve [{ name, rows: string[][], formulas: number }]. Los importes se
// leen tal como están guardados (texto o número) sin reinterpretarlos.
export function parseXlsxReport(buffer) {
  const files = zipEntries(buffer);
  const text = (name) => files.get(name)?.toString("utf8") ?? "";
  const shared = [
    ...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g),
  ].map(([, item]) =>
    unescapeXml(
      [...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
        .map(([, part]) => part)
        .join(""),
    ),
  );
  const names = [
    ...text("xl/workbook.xml").matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g),
  ].map(([, name]) => unescapeXml(name));
  return names.map((name, index) => {
    const xml = text(`xl/worksheets/sheet${index + 1}.xml`);
    const rows = [];
    for (const [, body] of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const [, attributes, inner] of body.matchAll(
        /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
      )) {
        const reference = /\br="([A-Z]+\d+)"/.exec(attributes)[1];
        const type = /\bt="([^"]*)"/.exec(attributes)?.[1];
        let value = "";
        if (inner) {
          const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
          if (type === "s") value = shared[Number(raw)];
          else if (type === "inlineStr")
            value = unescapeXml(
              [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
                .map(([, part]) => part)
                .join(""),
            );
          else value = unescapeXml(raw ?? "");
        }
        row[columnIndex(reference)] = value;
      }
      rows.push(Array.from(row, (value) => value ?? ""));
    }
    return {
      name,
      rows,
      formulas: [...xml.matchAll(/<f[\s>]/g)].length,
      cellTypes: new Set(
        [...xml.matchAll(/<c\b[^>]*\bt="([^"]*)"/g)].map(([, kind]) => kind),
      ),
    };
  });
}

// Texto de un PDF generado por PDFKit (fuentes estándar, flujos Flate). Las
// líneas se unen con un espacio: el ajuste de línea solo ocurre en espacios.
export function pdfText(buffer) {
  if (buffer.subarray(0, 4).toString() !== "%PDF")
    throw new Error("No es un PDF");
  const binary = buffer.toString("latin1");
  const lines = [];
  for (const [, stream] of binary.matchAll(
    /stream\r?\n([\s\S]*?)\r?\nendstream/g,
  )) {
    let content;
    try {
      content = inflateSync(Buffer.from(stream, "latin1")).toString("latin1");
    } catch {
      continue;
    }
    for (const match of content.matchAll(
      /\[((?:[^\]\\]|\\.)*)\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj|\(((?:[^)\\]|\\.)*)\)\s*Tj/g,
    )) {
      if (match[1] !== undefined) {
        lines.push(
          [...match[1].matchAll(/<([0-9a-fA-F]*)>|\(((?:[^)\\]|\\.)*)\)/g)]
            .map(([, hex, literal]) =>
              hex !== undefined
                ? Buffer.from(hex, "hex").toString("latin1")
                : literal.replace(/\\(.)/g, "$1"),
            )
            .join(""),
        );
      } else if (match[2] !== undefined)
        lines.push(Buffer.from(match[2], "hex").toString("latin1"));
      else lines.push(match[3].replace(/\\(.)/g, "$1"));
    }
  }
  return lines.join(" ").replace(/\s+/g, " ");
}

export const pdfPageCount = (buffer) =>
  [...buffer.toString("latin1").matchAll(/\/Type\s*\/Page\b(?!s)/g)].length;
